// src/app/company/dashboard/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';

export default function CompanyDashboardPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [stats, setStats] = useState({
    totalVehicles: 0,
    activeVehicles: 0,
    teamMembers: 0,
    pendingBookings: 0,
    monthlySpend: 0,
    activeBookings: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [team, setTeam] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Get user profile with company
      const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
          *,
          company:company_profiles(*),
          company_user:company_users(*)
        `)
        .eq('auth_user_id', user.id)
        .single();

      if (!profile || !profile.company) {
        router.push('/dashboard');
        return;
      }

      setUserProfile(profile);
      setCompany(profile.company);

      // Load stats
      await Promise.all([
        loadFleetStats(profile.company.id),
        loadTeamStats(profile.company.id),
        loadBookingStats(profile.company.id),
        loadRecentActivity(profile.company.id),
      ]);

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFleetStats = async (companyId) => {
    try {
      // Get all company vehicles
      const { data: vehicles } = await supabase
        .from('vehicle_ownership')
        .select(`
          vehicle:vehicles(*)
        `)
        .eq('owner_company_id', companyId);

      setFleet(vehicles?.map(v => v.vehicle) || []);
      
      setStats(prev => ({
        ...prev,
        totalVehicles: vehicles?.length || 0,
        activeVehicles: vehicles?.length || 0,
      }));
    } catch (error) {
      console.error('Error loading fleet:', error);
    }
  };

  const loadTeamStats = async (companyId) => {
    try {
      const { data: members } = await supabase
        .from('company_users')
        .select(`
          *,
          user:user_profiles(*)
        `)
        .eq('company_id', companyId)
        .eq('is_active', true);

      setTeam(members || []);
      
      setStats(prev => ({
        ...prev,
        teamMembers: members?.length || 0,
      }));
    } catch (error) {
      console.error('Error loading team:', error);
    }
  };

  const loadBookingStats = async (companyId) => {
    try {
      // Get company vehicles
      const { data: ownership } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_company_id', companyId);

      const vehicleIds = ownership?.map(o => o.vehicle_id) || [];

      if (vehicleIds.length > 0) {
        // Get bookings for company vehicles
        const { data: bookings } = await supabase
          .from('bookings')
          .select(`
            *,
            status:booking_statuses(code, display_name)
          `)
          .in('vehicle_id', vehicleIds)
          .order('created_at', { ascending: false });

        const pending = bookings?.filter(b => 
          ['pending', 'awaiting_approval'].includes(b.status?.code)
        ).length || 0;

        const active = bookings?.filter(b => 
          ['confirmed', 'in_progress'].includes(b.status?.code)
        ).length || 0;

        // Calculate monthly spend
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const { data: monthlyBookings } = await supabase
          .from('bookings')
          .select('id')
          .in('vehicle_id', vehicleIds)
          .gte('created_at', new Date(currentYear, currentMonth, 1).toISOString())
          .lte('created_at', new Date(currentYear, currentMonth + 1, 0).toISOString());

        // Get work orders for monthly bookings
        if (monthlyBookings && monthlyBookings.length > 0) {
          const { data: workOrders } = await supabase
            .from('work_orders')
            .select('total_amount')
            .in('id', monthlyBookings.map(b => b.id));

          const monthlySpend = workOrders?.reduce((sum, wo) => 
            sum + (parseFloat(wo.total_amount) || 0), 0
          ) || 0;

          setStats(prev => ({
            ...prev,
            pendingBookings: pending,
            activeBookings: active,
            monthlySpend,
          }));
        } else {
          setStats(prev => ({
            ...prev,
            pendingBookings: pending,
            activeBookings: active,
          }));
        }
      }
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  };

  const loadRecentActivity = async (companyId) => {
    try {
      const { data: ownership } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_company_id', companyId);

      const vehicleIds = ownership?.map(o => o.vehicle_id) || [];

      if (vehicleIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select(`
            id,
            booking_number,
            booking_date,
            created_at,
            vehicle:vehicles(plate_number, make, model),
            status:booking_statuses(display_name),
            customer:user_profiles(first_name, last_name)
          `)
          .in('vehicle_id', vehicleIds)
          .order('created_at', { ascending: false })
          .limit(10);

        setRecentActivity(bookings || []);
      }
    } catch (error) {
      console.error('Error loading activity:', error);
    }
  };

  const isAdmin = userProfile?.company_user?.some(cu => cu.is_admin);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">No company found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">{company.name}</h1>
              <p className="text-sm text-gray-600">
                {company.status === 'pending_verification' ? (
                  <span className="text-yellow-600">⏳ Pending Verification</span>
                ) : company.is_active ? (
                  <span className="text-green-600">✓ Active</span>
                ) : (
                  <span className="text-red-600">Inactive</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/company/settings"
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Settings
              </Link>
              {isAdmin && (
                <Link
                  href="/company/team/invite"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + Invite Team Member
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-8">
            {['overview', 'fleet', 'team', 'bookings', 'reports'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-2 border-b-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Total Vehicles</div>
                <div className="text-3xl font-bold">{stats.totalVehicles}</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Team Members</div>
                <div className="text-3xl font-bold">{stats.teamMembers}</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Active Bookings</div>
                <div className="text-3xl font-bold">{stats.activeBookings}</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Monthly Spend</div>
                <div className="text-3xl font-bold">
                  KES {stats.monthlySpend.toLocaleString()}
                </div>
                {company.budget_limit && (
                  <div className="text-xs text-gray-500 mt-1">
                    of KES {parseFloat(company.budget_limit).toLocaleString()} limit
                  </div>
                )}
              </div>
            </div>

            {/* Pending Approvals */}
            {isAdmin && stats.pendingBookings > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-yellow-900">
                      {stats.pendingBookings} Booking{stats.pendingBookings > 1 ? 's' : ''} Awaiting Approval
                    </h3>
                    <p className="text-sm text-yellow-700">
                      Review and approve pending bookings
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('bookings')}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                  >
                    Review
                  </button>
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h2 className="text-xl font-bold">Recent Activity</h2>
              </div>
              <div className="divide-y">
                {recentActivity.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    No recent activity
                  </div>
                ) : (
                  recentActivity.map(activity => (
                    <div key={activity.id} className="p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">
                            {activity.booking_number}
                          </div>
                          <div className="text-sm text-gray-600">
                            {activity.vehicle?.plate_number} - {activity.vehicle?.make} {activity.vehicle?.model}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(activity.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <span className="text-sm px-2 py-1 bg-gray-100 rounded">
                          {activity.status?.display_name}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Fleet Tab */}
        {activeTab === 'fleet' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Company Fleet</h2>
              {isAdmin && (
                <Link
                  href="/company/fleet/add"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + Add Vehicle
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fleet.map(vehicle => (
                <div key={vehicle.id} className="bg-white p-6 rounded-lg shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-xl font-bold">{vehicle.plate_number}</div>
                      <div className="text-gray-600">
                        {vehicle.make} {vehicle.model}
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">{vehicle.year_of_manufacture}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {vehicle.color && (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border"
                          style={{ backgroundColor: vehicle.color.toLowerCase() }}
                        />
                        <span className="capitalize">{vehicle.color}</span>
                      </div>
                    )}
                    {vehicle.vin && (
                      <div className="text-gray-500">VIN: {vehicle.vin}</div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t flex gap-2">
                    <Link
                      href={`/company/fleet/${vehicle.id}`}
                      className="flex-1 text-center px-3 py-2 border rounded hover:bg-gray-50"
                    >
                      View
                    </Link>
                    <Link
                      href={`/company/fleet/${vehicle.id}/book`}
                      className="flex-1 text-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Book Service
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {fleet.length === 0 && (
              <div className="bg-white p-12 rounded-lg shadow text-center">
                <p className="text-gray-600 mb-4">No vehicles in your fleet yet</p>
                {isAdmin && (
                  <Link
                    href="/company/fleet/add"
                    className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add Your First Vehicle
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Team Members</h2>
              {isAdmin && (
                <Link
                  href="/company/team/invite"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + Invite Member
                </Link>
              )}
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-4">Name</th>
                    <th className="text-left p-4">Role</th>
                    <th className="text-left p-4">Email</th>
                    <th className="text-left p-4">Status</th>
                    {isAdmin && <th className="text-left p-4">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {team.map(member => (
                    <tr key={member.id}>
                      <td className="p-4">
                        <div className="font-medium">
                          {member.user?.first_name} {member.user?.last_name}
                        </div>
                        {member.is_admin && (
                          <span className="text-xs text-blue-600">Admin</span>
                        )}
                      </td>
                      <td className="p-4 capitalize">{member.staff_role?.replace('_', ' ')}</td>
                      <td className="p-4 text-gray-600">{member.user?.phone}</td>
                      <td className="p-4">
                        <span className={`text-sm px-2 py-1 rounded ${
                          member.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="p-4">
                          <button className="text-blue-600 hover:underline text-sm">
                            Manage
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bookings Tab */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Company Bookings</h2>
              <Link
                href="/company/bookings/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + New Booking
              </Link>
            </div>

            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <p className="text-gray-600">Bookings management coming soon...</p>
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Reports & Analytics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="font-semibold mb-4">Fleet Utilization</h3>
                <p className="text-gray-600">Coming soon...</p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="font-semibold mb-4">Cost Analysis</h3>
                <p className="text-gray-600">Coming soon...</p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="font-semibold mb-4">Maintenance Schedule</h3>
                <p className="text-gray-600">Coming soon...</p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="font-semibold mb-4">Team Performance</h3>
                <p className="text-gray-600">Coming soon...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}