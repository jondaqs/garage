import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
    Truck,
    Users,
    Calendar,
    DollarSign
} from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function CompanyDashboard() {
    const supabase = await createClient()

    // ✅ Get session
    const {
        data: { session }
    } = await supabase.auth.getSession()

    if (!session) {
        redirect('/auth/login')
    }

    // ✅ Get user profile
    const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, company_id')
        .eq('auth_user_id', session.user.id)
        .single()

    if (profileError || !userProfile) {
        redirect('/auth/signup')
    }

    // ✅ Resolve company (owner OR member)
    let companyId = null

    // Check owner
    const { data: ownedCompany } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('owner_user_id', userProfile.id)
        .maybeSingle()

    if (ownedCompany) {
        companyId = ownedCompany.id
    } else {
        const { data: companyUser } = await supabase
            .from('company_users')
            .select('company_id')
            .eq('user_id', userProfile.id)
            .eq('is_active', true)
            .maybeSingle()

        if (companyUser) {
            companyId = companyUser.company_id
        }
    }

    if (!companyId) {
        redirect('/auth/company-signup')
    }

    // ✅ Sync company_id (important for RLS)
    if (userProfile.company_id !== companyId) {
        await supabase
            .from('user_profiles')
            .update({ company_id: companyId })
            .eq('id', userProfile.id)
    }

    // ✅ Fetch stats in parallel
    const [
        { count: vehicleCount },
        { count: membersCount },
        { data: fleet }
    ] = await Promise.all([
        supabase
            .from('vehicle_ownership')
            .select('*', { count: 'exact', head: true })
            .eq('owner_company_id', companyId),

        supabase
            .from('company_users')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId),

        supabase
            .from('vehicle_ownership')
            .select('vehicle_id')
            .eq('owner_company_id', companyId)
    ])

    // ✅ Fetch bookings
    let recentBookings = []

    if (fleet?.length > 0) {
        const vehicleIds = fleet.map(v => v.vehicle_id)

        const { data: bookingsData } = await supabase
            .from('bookings')
            .select('*')
            .in('vehicle_id', vehicleIds)
            .limit(5)

        recentBookings = bookingsData || []
    }

    const stats = {
        totalVehicles: vehicleCount || 0,
        teamMembers: membersCount || 0,
        pendingBookings: 0
    }

    const colorClasses = {
        blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
        green: { bg: 'bg-green-100', text: 'text-green-600' },
        yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
        purple: { bg: 'bg-purple-100', text: 'text-purple-600' }
    }

    const statCards = [
        {
            name: 'Total Vehicles',
            value: stats.totalVehicles,
            icon: Truck,
            color: 'blue',
            link: '/company/fleet'
        },
        {
            name: 'Team Members',
            value: stats.teamMembers,
            icon: Users,
            color: 'green',
            link: '/company/team'
        },
        {
            name: 'Pending Bookings',
            value: stats.pendingBookings,
            icon: Calendar,
            color: 'yellow',
            link: '/company/bookings'
        },
        {
            name: 'Monthly Budget',
            value: 'KES 0',
            icon: DollarSign,
            color: 'purple',
            link: '/company/reports'
        }
    ]

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Company Dashboard</h1>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {statCards.map((stat) => {
                    const Icon = stat.icon
                    const colors = colorClasses[stat.color]

                    return (
                        <Link
                            key={stat.name}
                            href={stat.link}
                            className="bg-white p-6 rounded-lg shadow hover:shadow-md"
                        >
                            <div className="flex justify-between mb-4">
                                <div className={`p-3 ${colors.bg} rounded-lg`}>
                                    <Icon className={`w-6 h-6 ${colors.text}`} />
                                </div>
                            </div>
                            <p className="text-gray-600 text-sm">{stat.name}</p>
                            <p className="text-2xl font-bold">{stat.value}</p>
                        </Link>
                    )
                })}
            </div>

            {/* Recent bookings */}
            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Recent Bookings</h2>

                {recentBookings.length === 0 ? (
                    <p className="text-gray-500">No recent bookings</p>
                ) : (
                    <div className="space-y-3">
                        {recentBookings.map((b) => (
                            <div key={b.id} className="border p-3 rounded-lg">
                                <p className="font-medium">{b.problem_description || 'Booking'}</p>
                                <p className="text-sm text-gray-600">
                                    {b.booking_date}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}