import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendCompanyRegistrationEmail } from '@/lib/email/sendCompanyInviteEmail'

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
            .from('user_profiles')
            .select('*')
            .eq('auth_user_id', user.id)
            .single()

        if (profileError) {
            console.error('❌ Profile error:', profileError)
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
        }

        // Check if user already owns a company
        const { data: existingCompany } = await supabase
            .from('company_profiles')
            .select('id, name')
            .eq('owner_user_id', userProfile.id)
            .maybeSingle()

        if (existingCompany) {
            return NextResponse.json({
                error: 'User already owns a company',
                existingCompany: existingCompany.name
            }, { status: 400 })
        }

        // Create company profile
        const { data: company, error: companyError } = await supabase
            .from('company_profiles')
            .insert([{
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
                    ? parseInt(body.companyDetails.yearsInOperation)
                    : null,
                opening_time: body.companyDetails.openingTime,
                closing_time: body.companyDetails.closingTime,
                owner_user_id: userProfile.id,
                status: 'pending_verification',
                submitted_at: new Date().toISOString(),
                is_active: false
            }])
            .select()

        if (companyError) {
            console.error('❌ Company creation error:', companyError)
            return NextResponse.json({
                error: `Failed to create company: ${companyError.message}`
            }, { status: 500 })
        }

        const companyId = company[0].id
        console.log('✅ Company created:', companyId)

        // Add owner as company user with admin rights
        const { error: companyUserError } = await supabase
            .from('company_users')
            .insert([{
                user_id: userProfile.id,
                company_id: companyId,
                staff_role: 'owner',
                is_admin: true,
                is_active: true,
                updated_by: userProfile.id
            }])

        if (companyUserError) {
            console.error('⚠️ Company user error:', companyUserError)
        } else {
            console.log('✅ Owner added as company admin')
        }

        // Assign company_owner role
        try {
            const { data: companyOwnerRole } = await supabase
                .from('user_roles_lookup')
                .select('id')
                .eq('code', 'company_owner')
                .single()

            if (companyOwnerRole) {
                const { error: roleError } = await supabase
                    .from('user_roles')
                    .insert([{
                        user_id: userProfile.id,
                        role_id: companyOwnerRole.id
                    }])

                if (roleError) {
                    console.error('⚠️ Role assignment error:', roleError)
                } else {
                    console.log('✅ Company owner role assigned')
                }
            } else {
                console.error('⚠️ company_owner role not found in user_roles_lookup')
            }
        } catch (roleError) {
            console.error('⚠️ Role assignment error:', roleError)
        }

        // Link uploaded documents to the company (uploaded_files pattern)
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

                // Also snapshot URL columns on company_profiles for quick admin access
                // BUG 1.3 FIX: correct column names from DB schema
                try {
                    const { data: uploadedFiles } = await supabase
                        .from('uploaded_files')
                        .select('id, storage_path')
                        .in('id', documentIds)

                    if (uploadedFiles && uploadedFiles.length > 0) {
                        const docUrls = {}

                        body.documents.forEach(doc => {
                            const file = uploadedFiles.find(f => f.id === doc.id)
                            if (file && file.storage_path) {
                                const { data: { publicUrl } } = supabase.storage
                                    .from('documents')
                                    .getPublicUrl(file.storage_path)
                                docUrls[doc.type] = publicUrl
                            }
                        })

                        // BUG 1.3 FIX: correct column names matching DB schema
                        // DB has: business_license_url, certificate_of_incorporation_url,
                        //         tax_certificate_url, insurance_documents_url
                        // No kra_pin_url column exists — store in tax_certificate_url
                        const { error: urlUpdateError } = await supabase
                            .from('company_profiles')
                            .update({
                                business_license_url: docUrls.business_license || null,
                                certificate_of_incorporation_url: docUrls.certificate_of_incorporation || null,
                                tax_certificate_url: docUrls.tax_compliance || docUrls.kra_pin || null,
                                insurance_documents_url: docUrls.insurance || null,  // was insurance_url ❌
                            })
                            .eq('id', companyId)

                        if (urlUpdateError) {
                            console.error('⚠️ Document URL snapshot error:', urlUpdateError)
                        } else {
                            console.log('✅ Document URLs snapshotted on company profile')
                        }
                    }
                } catch (docUrlError) {
                    console.error('⚠️ Document URL processing error (non-fatal):', docUrlError)
                }
            }
        }

        // Add team member invitations
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
                    }
                } catch (err) {
                    console.error('Team member invitation error:', err)
                }
            }
        }

        // Add fleet vehicles
        // BUG 1.2 FIX: plate_number and year_of_manufacture (not license_plate / year)
        if (body.fleet && body.fleet.length > 0) {
            for (const vehicle of body.fleet) {
                try {
                    const { data: newVehicle, error: vehicleError } = await supabase
                        .from('vehicles')
                        .insert([{
                            plate_number: vehicle.licensePlate || vehicle.plateNumber,  // was license_plate ❌
                            make: vehicle.make,
                            model: vehicle.model,
                            year_of_manufacture: vehicle.year ? parseInt(vehicle.year) : null,  // was year ❌
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
                            owner_company_id: companyId
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

        // Send confirmation email to owner
        try {
            await sendCompanyRegistrationEmail({
                ownerEmail: user.email,
                ownerName: `${userProfile.first_name} ${userProfile.last_name}`,
                companyName: company[0].name,
                companyId: companyId
            })
            console.log('✅ Registration confirmation email sent')
        } catch (emailError) {
            console.error('⚠️ Email error (non-fatal):', emailError)
        }

        // Notify all admins
        // BUG 1.1 FIX: was referencing undefined `adminRoles` — variable is `adminUsers`
        try {
            const { data: adminUsers } = await supabase
                .from('user_roles')
                .select('user_id, user_roles_lookup!inner(code)')
                .eq('user_roles_lookup.code', 'admin')

            if (adminUsers && adminUsers.length > 0) {
                const notifications = adminUsers.map(admin => ({
                    user_id: admin.user_id,
                    recipient_user_id: admin.user_id,
                    type: 'company_registration',
                    notification_type: 'company_registration',
                    reference_type: 'company',
                    reference_table: 'company_profiles',
                    reference_id: companyId,
                    title: 'New Company Registration',
                    message: `${company[0].name} has registered and is pending verification`,
                    is_read: false,
                    recipient_type: 'admin'
                }))

                const { error: notifError } = await supabase
                    .from('notifications')
                    .insert(notifications)

                if (notifError) {
                    console.error('⚠️ Admin notification error:', notifError)
                } else {
                    console.log(`✅ Notified ${adminUsers.length} admin(s)`)
                }
            } else {
                console.log('⚠️ No admins found to notify')
            }
        } catch (notifError) {
            console.error('⚠️ Notification error (non-fatal):', notifError)
        }

        return NextResponse.json({
            success: true,
            company: {
                id: companyId,
                name: company[0].name,
                status: company[0].status
            }
        })

    } catch (error) {
        console.error('❌ Registration error:', error)
        return NextResponse.json({
            error: `Registration failed: ${error.message}`
        }, { status: 500 })
    }
}