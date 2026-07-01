import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendCompanyRegistrationEmail, sendCompanyInviteEmail, sendAdminNewCompanyEmail } from '@/lib/email/sendCompanyInviteEmail'

// SECURITY FIX: Core company creation (company_profiles + company_users + user_roles
// + notifications) now uses register_company RPC in a single transaction.
// Team invitations, fleet vehicles, documents, and emails still handled here.

export async function POST(request) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        // Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            console.error('❌ Auth error:', authError)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get user profile
        const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles_secure')
            .select('*')
            .eq('auth_user_id', user.id)
            .single()

        if (profileError) {
            console.error('❌ Profile error:', profileError)
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
        }

        // ── 1. Core registration via RPC ──────────────────────────────────
        // Replaces: company_profiles INSERT, company_users INSERT,
        //           user_roles INSERT, notifications INSERT
        const { data: result, error: rpcError } = await supabase.rpc('register_company', {
            p_data: {
                name: body.companyInfo.name,
                registration_number: body.companyInfo.registrationNumber,
                tax_id: body.companyInfo.taxId,
                industry: body.companyInfo.industry || body.companyInfo.industryType,
                company_size: body.companyInfo.companySize,
                bio: body.companyDetails.bio,
                website: body.companyDetails.website,
                phone: body.companyDetails.phone,
                physical_address: body.companyDetails.address || body.companyDetails.physicalAddress,
                city: body.companyDetails.city,
                country: body.companyDetails.country || 'Kenya',
                working_days: body.companyDetails.workingDays || null,
                years_in_operation: body.companyDetails.yearsInOperation
                    ? parseInt(body.companyDetails.yearsInOperation) : null,
                opening_time: body.companyDetails.openingTime,
                closing_time: body.companyDetails.closingTime,
            }
        })

        if (rpcError) {
            console.error('❌ register_company RPC error:', rpcError)
            return NextResponse.json({
                error: 'Failed to create company'
            }, { status: 500 })
        }

        if (!result?.success) {
            return NextResponse.json({
                error: result?.error || 'Company registration failed'
            }, { status: 400 })
        }

        const companyId = result.company_id
        console.log('✅ Company registered via RPC:', companyId)

        // ── 2. Link uploaded documents ────────────────────────────────────
        if (body.documents && body.documents.length > 0) {
            const documentIds = body.documents.map(doc => doc.id).filter(Boolean)

            if (documentIds.length > 0) {
                const { error: docsUpdateError } = await supabase
                    .from('uploaded_files')
                    .update({
                        reference_type: 'company_document',
                        reference_id: companyId
                    })
                    .in('id', documentIds)

                if (docsUpdateError) {
                    console.error('⚠️ Documents link error:', docsUpdateError)
                } else {
                    console.log('✅ Documents linked to company')
                }
            }
        }

        // ── 3. Team member invitations ────────────────────────────────────
        if (body.teamMembers && body.teamMembers.length > 0) {
            for (const member of body.teamMembers) {
                try {
                    const inviteToken = Math.random().toString(36).substring(2) + Date.now().toString(36)
                    const expiresAt = new Date()
                    expiresAt.setDate(expiresAt.getDate() + 7)

                    const { error: inviteError } = await supabase
                        .from('company_invitations')
                        .insert([{
                            company_id: companyId,
                            invited_by: userProfile.id,
                            email: member.email,
                            first_name: member.firstName,
                            last_name: member.lastName,
                            phone: member.phone,
                            staff_role: member.role || member.staffRole || 'driver',
                            is_admin: member.isAdmin || false,
                            invitation_token: inviteToken,
                            expires_at: expiresAt.toISOString(),
                            status: 'pending'
                        }])

                    if (inviteError) {
                        console.error(`⚠️ Invitation error for ${member.email}:`, inviteError)
                    } else {
                        console.log(`✅ Invitation created for ${member.email}`)
                        try {
                            await sendCompanyInviteEmail({
                                inviteeEmail: member.email,
                                inviteeName: `${member.firstName || ''} ${member.lastName || ''}`.trim(),
                                companyName: body.companyInfo.name,
                                inviterName: `${userProfile.first_name} ${userProfile.last_name}`,
                                staffRole: member.role || member.staffRole || 'driver',
                                invitationToken: inviteToken,
                            })
                        } catch (emailErr) {
                            console.error(`⚠️ Invite email error for ${member.email} (non-fatal):`, emailErr)
                        }
                    }
                } catch (err) {
                    console.error('Team member invitation error:', err)
                }
            }
        }

        // ── 4. Fleet vehicles ─────────────────────────────────────────────
        if (body.fleet && body.fleet.length > 0) {
            for (const vehicle of body.fleet) {
                try {
                    const { data: newVehicle, error: vehicleError } = await supabase
                        .from('vehicles')
                        .insert([{
                            plate_number: vehicle.licensePlate || vehicle.plateNumber,
                            make: vehicle.make,
                            model: vehicle.model,
                            year_of_manufacture: vehicle.year ? parseInt(vehicle.year) : null,
                            color: vehicle.color,
                            vin: vehicle.vin
                        }])
                        .select()
                        .single()

                    if (vehicleError) {
                        console.error(`⚠️ Vehicle creation error for ${vehicle.licensePlate || vehicle.plateNumber}:`, vehicleError)
                        continue
                    }

                    const { error: ownershipError } = await supabase
                        .from('vehicle_ownership')
                        .insert([{
                            vehicle_id: newVehicle.id,
                            owner_company_id: companyId,
                            owner_user_id: userProfile.id
                        }])

                    if (ownershipError) {
                        console.error(`⚠️ Ownership error:`, ownershipError)
                    } else {
                        console.log(`✅ Vehicle ${newVehicle.plate_number} added to fleet`)
                    }
                } catch (err) {
                    console.error('Fleet vehicle error:', err)
                }
            }
        }

        // ── 5. Emails ─────────────────────────────────────────────────────
        // Send confirmation email to owner
        try {
            await sendCompanyRegistrationEmail({
                ownerEmail: user.email,
                ownerName: `${userProfile.first_name} ${userProfile.last_name}`,
                companyName: body.companyInfo.name,
                companyId: companyId
            })
            console.log('✅ Registration confirmation email sent')
        } catch (emailError) {
            console.error('⚠️ Email error (non-fatal):', emailError)
        }

        // Send email alert to admin inbox
        try {
            const adminEmail = process.env.ADMIN_EMAIL
            if (adminEmail) {
                await sendAdminNewCompanyEmail({
                    adminEmail,
                    companyName: body.companyInfo.name,
                    ownerName: `${userProfile.first_name} ${userProfile.last_name}`,
                    ownerEmail: user.email,
                    registrationNumber: body.companyInfo.registrationNumber,
                    companyId,
                })
            } else {
                console.log('⚠️ ADMIN_EMAIL not set — skipping admin email alert')
            }
        } catch (adminEmailError) {
            console.error('⚠️ Admin email alert error (non-fatal):', adminEmailError)
        }

        return NextResponse.json({
            success: true,
            company: {
                id: companyId,
                name: body.companyInfo.name,
                status: 'pending_verification'
            }
        })

    } catch (error) {
        console.error('❌ Registration error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
