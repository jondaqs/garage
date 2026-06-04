// src/app/company/team/invite/page.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { piiHmac } from '@/lib/pii';

export default function InviteTeamMemberPage() {
  const router = useRouter();
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteMethod, setInviteMethod] = useState('single'); // 'single' or 'bulk'
  
  const [singleInvite, setSingleInvite] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'driver',
    isAdmin: false,
  });
  
  const [bulkFile, setBulkFile] = useState(null);

  const handleSingleInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Get user's company
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id, company_id')
        .eq('auth_user_id', user.id)
        .single();
      
      if (!profile?.company_id) {
        throw new Error('You are not associated with a company');
      }
      
      // Check if user already exists (PII: search by blind index)
      const phoneIdx = await piiHmac(supabase, singleInvite.phone);
      const { data: existingUser } = await supabase
        .from('user_profiles_secure')
        .select('id, auth_user_id')
        .eq('phone_idx', phoneIdx)
        .maybeSingle();
      
      // Check if already a team member
      if (existingUser) {
        const { data: existingMember } = await supabase
          .from('company_users')
          .select('id')
          .eq('user_id', existingUser.id)
          .eq('company_id', profile.company_id)
          .maybeSingle();
        
        if (existingMember) {
          throw new Error('This user is already a team member');
        }
      }
      
      // Create invitation
      const { error: inviteError } = await supabase
        .from('company_invitations')
        .insert({
          company_id: profile.company_id,
          email: singleInvite.email,
          phone: singleInvite.phone,
          first_name: singleInvite.firstName,
          last_name: singleInvite.lastName,
          staff_role: singleInvite.role,
          is_admin: singleInvite.isAdmin,
          invited_by: profile.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        });
      
      if (inviteError) throw inviteError;
      
      // Send invitation email
      await fetch('/api/company/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:     singleInvite.email,
          phone:     singleInvite.phone,
          firstName: singleInvite.firstName,
          lastName:  singleInvite.lastName,
          role:      singleInvite.role,
          isAdmin:   singleInvite.isAdmin,
        }),
      });
      
      setSuccess('Invitation sent successfully!');
      setSingleInvite({
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        role: 'driver',
        isAdmin: false,
      });
      
      setTimeout(() => router.push('/company/dashboard?tab=team'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      if (!bulkFile) throw new Error('Please select a file');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Get user's company
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id, company_id')
        .eq('auth_user_id', user.id)
        .single();
      
      if (!profile?.company_id) {
        throw new Error('You are not associated with a company');
      }
      
      // Read CSV file
      const text = await bulkFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // Validate headers
      const requiredHeaders = ['email', 'first_name', 'last_name', 'phone', 'role'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
      }
      
      // Process each row
      const invitations = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        
        if (row.email && row.first_name && row.last_name && row.phone) {
          invitations.push({
            company_id: profile.company_id,
            email: row.email,
            phone: row.phone,
            first_name: row.first_name,
            last_name: row.last_name,
            staff_role: row.role || 'driver',
            is_admin: row.is_admin?.toLowerCase() === 'true',
            invited_by: profile.id,
            status: 'pending',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
      
      if (invitations.length === 0) {
        throw new Error('No valid invitations found in file');
      }
      
      // Insert invitations
      const { error: inviteError } = await supabase
        .from('company_invitations')
        .insert(invitations);
      
      if (inviteError) throw inviteError;
      
      setSuccess(`Successfully invited ${invitations.length} team member(s)!`);
      setBulkFile(null);
      
      setTimeout(() => router.push('/company/dashboard?tab=team'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = 'email,first_name,last_name,phone,role,is_admin\n' +
                    'john@example.com,John,Doe,+254700000000,driver,false\n' +
                    'jane@example.com,Jane,Smith,+254700000001,fleet_manager,true';
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'team_members_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline mb-4"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold mb-2">Invite Team Members</h1>
          <p className="text-gray-600">
            Add new members to your company team
          </p>
        </div>

        {/* Method Selection */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setInviteMethod('single')}
              className={`flex-1 py-4 px-6 font-medium ${
                inviteMethod === 'single'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600'
              }`}
            >
              Single Invitation
            </button>
            <button
              onClick={() => setInviteMethod('bulk')}
              className={`flex-1 py-4 px-6 font-medium ${
                inviteMethod === 'bulk'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600'
              }`}
            >
              Bulk Upload
            </button>
          </div>

          {error && (
            <div className="m-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="m-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
              {success}
            </div>
          )}

          {/* Single Invitation Form */}
          {inviteMethod === 'single' && (
            <form onSubmit={handleSingleInvite} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={singleInvite.firstName}
                    onChange={(e) => setSingleInvite({...singleInvite, firstName: e.target.value})}
                    className="w-full p-3 border rounded-lg"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={singleInvite.lastName}
                    onChange={(e) => setSingleInvite({...singleInvite, lastName: e.target.value})}
                    className="w-full p-3 border rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={singleInvite.email}
                  onChange={(e) => setSingleInvite({...singleInvite, email: e.target.value})}
                  className="w-full p-3 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={singleInvite.phone}
                  onChange={(e) => setSingleInvite({...singleInvite, phone: e.target.value})}
                  className="w-full p-3 border rounded-lg"
                  placeholder="+254 700 000 000"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Role *
                </label>
                <select
                  value={singleInvite.role}
                  onChange={(e) => setSingleInvite({...singleInvite, role: e.target.value})}
                  className="w-full p-3 border rounded-lg"
                  required
                >
                  <option value="driver">Driver</option>
                  <option value="fleet_manager">Fleet Manager</option>
                  <option value="mechanic">Mechanic</option>
                  <option value="accountant">Accountant</option>
                  <option value="administrator">Administrator</option>
                </select>
              </div>

              <div className="border p-4 rounded-lg">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={singleInvite.isAdmin}
                    onChange={(e) => setSingleInvite({...singleInvite, isAdmin: e.target.checked})}
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">Admin Access</div>
                    <div className="text-sm text-gray-600">
                      Grant admin permissions to manage team and fleet
                    </div>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Sending Invitation...' : 'Send Invitation'}
              </button>
            </form>
          )}

          {/* Bulk Upload Form */}
          {inviteMethod === 'bulk' && (
            <form onSubmit={handleBulkInvite} className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">
                  How to use bulk upload
                </h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Download the CSV template below</li>
                  <li>Fill in your team members' information</li>
                  <li>Upload the completed file</li>
                </ol>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  ↓ Download CSV Template
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Upload CSV File *
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBulkFile(e.target.files[0])}
                  className="w-full p-3 border rounded-lg"
                  required
                />
                {bulkFile && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ {bulkFile.name} selected
                  </p>
                )}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg text-sm">
                <h4 className="font-medium mb-2">Required Columns:</h4>
                <ul className="space-y-1 text-gray-600">
                  <li><code className="bg-white px-2 py-1 rounded">email</code> - Email address</li>
                  <li><code className="bg-white px-2 py-1 rounded">first_name</code> - First name</li>
                  <li><code className="bg-white px-2 py-1 rounded">last_name</code> - Last name</li>
                  <li><code className="bg-white px-2 py-1 rounded">phone</code> - Phone number</li>
                  <li><code className="bg-white px-2 py-1 rounded">role</code> - driver, fleet_manager, mechanic, accountant, administrator</li>
                  <li><code className="bg-white px-2 py-1 rounded">is_admin</code> - true or false (optional)</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={loading || !bulkFile}
                className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Send Invitations'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}