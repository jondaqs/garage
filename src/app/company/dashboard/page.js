'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
    Truck,
    Users,
    Calendar,
    DollarSign
} from 'lucide-react'

export default function CompanyDashboard() {
    const [stats, setStats] = useState({
        totalVehicles: 0,
        activeVehicles: 0,
        teamMembers: 0,
        pendingBookings: 0
    })
    const [recentBookings, setRecentBookings] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchDashboardData()
    }, [])

    const fetchDashboardData = async () => {
        const supabase = createClient()

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('auth_user_id', user.id)
                .single()

            const { data: companyUser } = await supabase
                .from('company_users')
                .select('company_id')
                .eq('user_id', userProfile.id)
                .single()

            if (!companyUser) return

            // Fetch fleet count
            const { count: vehicleCount } = await supabase
                .from('vehicle_ownership')
                .select('*', { count: 'exact', head: true })
                .eq('owner_company_id', companyUser.company_id)

            // Fetch team members count
            const { count: membersCount } = await supabase
                .from('company_users')
                .select('*', { count: 'exact', head: true })
                .eq('company_id', companyUser.company_id)

            setStats({
                totalVehicles: vehicleCount || 0,
                activeVehicles: vehicleCount || 0,
                teamMembers: membersCount || 0,
                pendingBookings: 0
            })

        } catch (error) {
            console.error('Error fetching dashboard data:', error)
        } finally {
            setLoading(false)
        }
    }

    const statCards = [
        {
            name: 'Total Vehicles',
            value: stats.totalVehicles,
            icon: Truck,  // Changed from TruckIcon
            color: 'blue',
            link: '/company/fleet'
        },
        {
            name: 'Team Members',
            value: stats.teamMembers,
            icon: Users,  // Changed from UsersIcon
            color: 'green',
            link: '/company/team'
        },
        {
            name: 'Pending Bookings',
            value: stats.pendingBookings,
            icon: Calendar,  // Changed from CalendarIcon
            color: 'yellow',
            link: '/company/bookings'
        },
        {
            name: 'Monthly Budget',
            value: 'KES 0',
            icon: DollarSign,  // Changed from CurrencyDollarIcon
            color: 'purple',
            link: '/company/reports'
        }
    ]

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">Loading dashboard...</div>
            </div>
        )
    }

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Company Dashboard</h1>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {statCards.map((stat) => {
                    const Icon = stat.icon
                    return (
                        <Link
                            key={stat.name}
                            href={stat.link}
                            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className={`p-3 bg-${stat.color}-100 rounded-lg`}>
                                    <Icon className={`w-6 h-6 text-${stat.color}-600`} />
                                </div>
                            </div>
                            <p className="text-gray-600 text-sm">{stat.name}</p>
                            <p className="text-2xl font-bold mt-1">{stat.value}</p>
                        </Link>
                    )
                })}
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold mb-4">Recent Bookings</h2>
                    {recentBookings.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No recent bookings</p>
                    ) : (
                        <div className="space-y-3">
                            {recentBookings.map((booking) => (
                                <div key={booking.id} className="p-3 border rounded-lg">
                                    <p className="font-medium">{booking.service}</p>
                                    <p className="text-sm text-gray-600">{booking.date}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
                    <div className="space-y-3">
                        <Link
                            href="/company/fleet/add"
                            className="block p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-center"
                        >
                            + Add Vehicle to Fleet
                        </Link>
                        <Link
                            href="/company/team"
                            className="block p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 text-center"
                        >
                            + Invite Team Member
                        </Link>
                        <Link
                            href="/company/bookings/new"
                            className="block p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 text-center"
                        >
                            + Book Service
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}