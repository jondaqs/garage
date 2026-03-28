// src/app/auth/company-signup/page.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const STEPS = {
  EMAIL_VERIFICATION: 'email_verification',
  COMPANY_INFO: 'company_info',
  COMPANY_DETAILS: 'company_details',
  DOCUMENTS: 'documents',
  TEAM_SETUP: 'team_setup',
  FLEET_SETUP: 'fleet_setup',
  PREFERENCES: 'preferences',
  REVIEW: 'review',
};

export default function CompanySignupPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  
  const [currentStep, setCurrentStep] = useState(STEPS.EMAIL_VERIFICATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sentCode, setSentCode] = useState(false);
  
  // Form data state
  const [formData, setFormData] = useState({
    // Email & Auth
    email: '',
    password: '',
    confirmPassword: '',
    
    // Company Info
    companyName: '',
    registrationNumber: '',
    taxId: '',
    industry: '',
    companySize: '',
    
    // Company Details
    bio: '',
    website: '',
    phone: '',
    yearsInOperation: '',
    physicalAddress: '',
    
    // Operating Hours
    openingTime: '08:00',
    closingTime: '17:00',
    workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    
    // Documents
    businessLicense: null,
    certificateOfIncorporation: null,
    taxCertificate: null,
    insuranceDocuments: null,
    
    // Team Members
    teamMembers: [],
    
    // Fleet
    vehicles: [],
    
    // Preferences
    budgetLimit: '',
    approvalRequired: true,
    notificationPreferences: {
      email: true,
      sms: false,
    },
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const sendVerificationCode = async () => {
    setLoading(true);
    setError('');
    
    try {
      // In production, this would send actual verification code
      // For now, we'll simulate it
      const response = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, type: 'company' }),
      });
      
      if (!response.ok) throw new Error('Failed to send verification code');
      
      setSentCode(true);
      alert('Verification code sent to ' + formData.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Verify the code
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: formData.email, 
          code: verificationCode,
          type: 'company',
        }),
      });
      
      if (!response.ok) throw new Error('Invalid verification code');
      
      // Create auth account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            user_type: 'company',
          },
        },
      });
      
      if (signUpError) throw signUpError;
      
      setCurrentStep(STEPS.COMPANY_INFO);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyInfoSubmit = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Check for duplicate company registration
      const { data: existing, error: checkError } = await supabase
        .from('company_profiles')
        .select('id, name')
        .or(`name.eq.${formData.companyName},registration_number.eq.${formData.registrationNumber}`)
        .single();
      
      if (existing) {
        throw new Error(`Company "${existing.name}" is already registered. Please contact support if you need to join this company.`);
      }
      
      setCurrentStep(STEPS.COMPANY_DETAILS);
    } catch (err) {
      if (err.message.includes('already registered')) {
        setError(err.message);
      } else {
        setCurrentStep(STEPS.COMPANY_DETAILS);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentUpload = async (docType, file) => {
    setLoading(true);
    setError('');
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${docType}.${fileExt}`;
      const filePath = `company-documents/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      handleInputChange(docType, filePath);
    } catch (err) {
      setError(`Failed to upload ${docType}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addTeamMember = () => {
    const newMember = {
      id: Date.now(),
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'driver',
      isAdmin: false,
      assignedVehicles: [],
    };
    
    handleInputChange('teamMembers', [...formData.teamMembers, newMember]);
  };

  const updateTeamMember = (id, field, value) => {
    const updated = formData.teamMembers.map(member =>
      member.id === id ? { ...member, [field]: value } : member
    );
    handleInputChange('teamMembers', updated);
  };

  const removeTeamMember = (id) => {
    const filtered = formData.teamMembers.filter(member => member.id !== id);
    handleInputChange('teamMembers', filtered);
  };

  const addVehicle = () => {
    const newVehicle = {
      id: Date.now(),
      plateNumber: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      vin: '',
      color: '',
      assignedDriver: '',
    };
    
    handleInputChange('vehicles', [...formData.vehicles, newVehicle]);
  };

  const updateVehicle = (id, field, value) => {
    const updated = formData.vehicles.map(vehicle =>
      vehicle.id === id ? { ...vehicle, [field]: value } : vehicle
    );
    handleInputChange('vehicles', updated);
  };

  const removeVehicle = (id) => {
    const filtered = formData.vehicles.filter(vehicle => vehicle.id !== id);
    handleInputChange('vehicles', filtered);
  };

  const submitRegistration = async () => {
    setLoading(true);
    setError('');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Create company profile
      const { data: company, error: companyError } = await supabase
        .from('company_profiles')
        .insert({
          name: formData.companyName,
          registration_number: formData.registrationNumber,
          tax_id: formData.taxId,
          industry: formData.industry,
          company_size: formData.companySize,
          bio: formData.bio,
          website: formData.website,
          phone: formData.phone,
          years_in_operation: parseInt(formData.yearsInOperation),
          physical_address: formData.physicalAddress,
          opening_time: formData.openingTime,
          closing_time: formData.closingTime,
          working_days: formData.workingDays,
          business_license_url: formData.businessLicense,
          certificate_of_incorporation_url: formData.certificateOfIncorporation,
          tax_certificate_url: formData.taxCertificate,
          insurance_documents_url: formData.insuranceDocuments,
          budget_limit: formData.budgetLimit ? parseFloat(formData.budgetLimit) : null,
          approval_required: formData.approvalRequired,
          is_active: false, // Pending verification
          status: 'pending_verification',
        })
        .select()
        .single();
      
      if (companyError) throw companyError;
      
      // Create user profile as company owner
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          auth_user_id: user.id,
          company_id: company.id,
          first_name: formData.ownerFirstName || '',
          last_name: formData.ownerLastName || '',
          phone: formData.ownerPhone || formData.phone,
        })
        .select()
        .single();
      
      if (profileError) throw profileError;
      
      // Set as company owner
      const { error: ownerError } = await supabase
        .from('company_users')
        .insert({
          user_id: userProfile.id,
          company_id: company.id,
          staff_role: 'owner',
          is_admin: true,
          is_active: true,
        });
      
      if (ownerError) throw ownerError;
      
      // Assign company_owner role
      const { data: ownerRole } = await supabase
        .from('user_roles_lookup')
        .select('id')
        .eq('code', 'company_owner')
        .single();
      
      if (ownerRole) {
        await supabase
          .from('user_roles')
          .insert({
            user_id: userProfile.id,
            role_id: ownerRole.id,
          });
      }
      
      // Create team member invitations
      if (formData.teamMembers.length > 0) {
        const invitations = formData.teamMembers.map(member => ({
          company_id: company.id,
          email: member.email,
          first_name: member.firstName,
          last_name: member.lastName,
          phone: member.phone,
          staff_role: member.role,
          is_admin: member.isAdmin,
          invited_by: userProfile.id,
          status: 'pending',
        }));
        
        await supabase
          .from('company_invitations')
          .insert(invitations);
      }
      
      // Create fleet vehicles
      if (formData.vehicles.length > 0) {
        for (const vehicle of formData.vehicles) {
          const { data: newVehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .insert({
              plate_number: vehicle.plateNumber,
              make: vehicle.make,
              model: vehicle.model,
              year_of_manufacture: vehicle.year,
              vin: vehicle.vin,
              color: vehicle.color,
            })
            .select()
            .single();
          
          if (vehicleError) continue;
          
          // Set company ownership
          await supabase
            .from('vehicle_ownership')
            .insert({
              vehicle_id: newVehicle.id,
              owner_company_id: company.id,
            });
        }
      }
      
      // Send notification to platform admin
      await supabase
        .from('notifications')
        .insert({
          user_id: null, // Platform admin
          type: 'new_company_registration',
          title: 'New Company Registration',
          message: `${formData.companyName} has registered and is pending verification.`,
          data: { company_id: company.id },
        });
      
      router.push('/company/pending-verification');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case STEPS.EMAIL_VERIFICATION:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Company Registration</h2>
              <p className="text-gray-600">Let's start by verifying your company email address</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Company Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full p-3 border rounded-lg"
                placeholder="email@company.com"
                disabled={sentCode}
              />
              <p className="text-xs text-gray-500 mt-1">
                Please use your official company email address
              </p>
            </div>
            
            {!sentCode ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="w-full p-3 border rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className="w-full p-3 border rounded-lg"
                  />
                </div>
                
                <button
                  onClick={sendVerificationCode}
                  disabled={loading || !formData.email || formData.password !== formData.confirmPassword}
                  className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Verification Code</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="w-full p-3 border rounded-lg text-center text-2xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>
                
                <button
                  onClick={verifyCode}
                  disabled={loading || verificationCode.length !== 6}
                  className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </button>
                
                <button
                  onClick={() => setSentCode(false)}
                  className="w-full text-blue-600 p-2 text-sm"
                >
                  Change Email Address
                </button>
              </>
            )}
          </div>
        );
      
      case STEPS.COMPANY_INFO:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Company Information</h2>
              <p className="text-gray-600">Tell us about your company</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Legal Company Name *</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                className="w-full p-3 border rounded-lg"
                placeholder="Acme Corporation Ltd"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Registration Number *</label>
                <input
                  type="text"
                  value={formData.registrationNumber}
                  onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="C.123456"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Tax ID / KRA PIN *</label>
                <input
                  type="text"
                  value={formData.taxId}
                  onChange={(e) => handleInputChange('taxId', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="A123456789X"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Industry *</label>
                <select
                  value={formData.industry}
                  onChange={(e) => handleInputChange('industry', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                >
                  <option value="">Select industry</option>
                  <option value="logistics">Logistics & Transportation</option>
                  <option value="delivery">Delivery Services</option>
                  <option value="rideshare">Rideshare / Taxi</option>
                  <option value="construction">Construction</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="retail">Retail</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Company Size</label>
                <select
                  value={formData.companySize}
                  onChange={(e) => handleInputChange('companySize', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                >
                  <option value="">Select size</option>
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="500+">500+ employees</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(STEPS.EMAIL_VERIFICATION)}
                className="px-6 py-3 border rounded-lg"
              >
                Back
              </button>
              <button
                onClick={handleCompanyInfoSubmit}
                disabled={loading || !formData.companyName || !formData.registrationNumber}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Checking...' : 'Continue'}
              </button>
            </div>
          </div>
        );
      
      case STEPS.COMPANY_DETAILS:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Company Details</h2>
              <p className="text-gray-600">Additional information about your business</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Company Description</label>
              <textarea
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                className="w-full p-3 border rounded-lg h-24"
                placeholder="Brief description of your company..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Website</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="https://company.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Phone Number *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  placeholder="+254 700 000 000"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Physical Address *</label>
              <input
                type="text"
                value={formData.physicalAddress}
                onChange={(e) => handleInputChange('physicalAddress', e.target.value)}
                className="w-full p-3 border rounded-lg"
                placeholder="Street, Building, City"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Years in Operation</label>
              <input
                type="number"
                value={formData.yearsInOperation}
                onChange={(e) => handleInputChange('yearsInOperation', e.target.value)}
                className="w-full p-3 border rounded-lg"
                min="0"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Opening Time</label>
                <input
                  type="time"
                  value={formData.openingTime}
                  onChange={(e) => handleInputChange('openingTime', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Closing Time</label>
                <input
                  type="time"
                  value={formData.closingTime}
                  onChange={(e) => handleInputChange('closingTime', e.target.value)}
                  className="w-full p-3 border rounded-lg"
                />
              </div>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(STEPS.COMPANY_INFO)}
                className="px-6 py-3 border rounded-lg"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(STEPS.DOCUMENTS)}
                disabled={!formData.phone || !formData.physicalAddress}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        );
      
      case STEPS.DOCUMENTS:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Company Documents</h2>
              <p className="text-gray-600">Upload required business documents</p>
            </div>
            
            {[
              { key: 'businessLicense', label: 'Business License', required: true },
              { key: 'certificateOfIncorporation', label: 'Certificate of Incorporation', required: true },
              { key: 'taxCertificate', label: 'Tax Compliance Certificate', required: true },
              { key: 'insuranceDocuments', label: 'Insurance Documents', required: false },
            ].map(doc => (
              <div key={doc.key} className="border p-4 rounded-lg">
                <label className="block text-sm font-medium mb-2">
                  {doc.label} {doc.required && '*'}
                </label>
                <input
                  type="file"
                  onChange={(e) => e.target.files[0] && handleDocumentUpload(doc.key, e.target.files[0])}
                  className="w-full"
                  accept=".pdf,.jpg,.jpeg,.png"
                />
                {formData[doc.key] && (
                  <p className="text-sm text-green-600 mt-2">✓ Uploaded</p>
                )}
              </div>
            ))}
            
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(STEPS.COMPANY_DETAILS)}
                className="px-6 py-3 border rounded-lg"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(STEPS.TEAM_SETUP)}
                disabled={!formData.businessLicense || !formData.certificateOfIncorporation || !formData.taxCertificate}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        );
      
      case STEPS.TEAM_SETUP:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Add Team Members</h2>
              <p className="text-gray-600">Invite users to join your company (optional)</p>
            </div>
            
            {formData.teamMembers.map((member, index) => (
              <div key={member.id} className="border p-4 rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Team Member #{index + 1}</h3>
                  <button
                    onClick={() => removeTeamMember(member.id)}
                    className="text-red-600 text-sm"
                  >
                    Remove
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={member.firstName}
                    onChange={(e) => updateTeamMember(member.id, 'firstName', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={member.lastName}
                    onChange={(e) => updateTeamMember(member.id, 'lastName', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={member.email}
                    onChange={(e) => updateTeamMember(member.id, 'email', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={member.phone}
                    onChange={(e) => updateTeamMember(member.id, 'phone', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <select
                    value={member.role}
                    onChange={(e) => updateTeamMember(member.id, 'role', e.target.value)}
                    className="p-2 border rounded"
                  >
                    <option value="driver">Driver</option>
                    <option value="fleet_manager">Fleet Manager</option>
                    <option value="mechanic">Mechanic</option>
                    <option value="accountant">Accountant</option>
                    <option value="administrator">Administrator</option>
                  </select>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={member.isAdmin}
                      onChange={(e) => updateTeamMember(member.id, 'isAdmin', e.target.checked)}
                    />
                    <span className="text-sm">Admin Access</span>
                  </label>
                </div>
              </div>
            ))}
            
            <button
              onClick={addTeamMember}
              className="w-full p-3 border-2 border-dashed rounded-lg hover:bg-gray-50"
            >
              + Add Team Member
            </button>
            
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(STEPS.DOCUMENTS)}
                className="px-6 py-3 border rounded-lg"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(STEPS.FLEET_SETUP)}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        );
      
      case STEPS.FLEET_SETUP:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Company Fleet</h2>
              <p className="text-gray-600">Add your company vehicles (optional)</p>
            </div>
            
            {formData.vehicles.map((vehicle, index) => (
              <div key={vehicle.id} className="border p-4 rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Vehicle #{index + 1}</h3>
                  <button
                    onClick={() => removeVehicle(vehicle.id)}
                    className="text-red-600 text-sm"
                  >
                    Remove
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Plate Number *"
                    value={vehicle.plateNumber}
                    onChange={(e) => updateVehicle(vehicle.id, 'plateNumber', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Make (e.g., Toyota)"
                    value={vehicle.make}
                    onChange={(e) => updateVehicle(vehicle.id, 'make', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Model (e.g., Hilux)"
                    value={vehicle.model}
                    onChange={(e) => updateVehicle(vehicle.id, 'model', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Year"
                    value={vehicle.year}
                    onChange={(e) => updateVehicle(vehicle.id, 'year', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="VIN (Optional)"
                    value={vehicle.vin}
                    onChange={(e) => updateVehicle(vehicle.id, 'vin', e.target.value)}
                    className="p-2 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Color"
                    value={vehicle.color}
                    onChange={(e) => updateVehicle(vehicle.id, 'color', e.target.value)}
                    className="p-2 border rounded"
                  />
                </div>
              </div>
            ))}
            
            <button
              onClick={addVehicle}
              className="w-full p-3 border-2 border-dashed rounded-lg hover:bg-gray-50"
            >
              + Add Vehicle
            </button>
            
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(STEPS.TEAM_SETUP)}
                className="px-6 py-3 border rounded-lg"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(STEPS.PREFERENCES)}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        );
      
      case STEPS.PREFERENCES:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Company Preferences</h2>
              <p className="text-gray-600">Set up your company policies</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Monthly Budget Limit (Optional)
              </label>
              <input
                type="number"
                value={formData.budgetLimit}
                onChange={(e) => handleInputChange('budgetLimit', e.target.value)}
                className="w-full p-3 border rounded-lg"
                placeholder="KES 100,000"
              />
              <p className="text-xs text-gray-500 mt-1">
                Set a monthly spending limit for vehicle services
              </p>
            </div>
            
            <div className="border p-4 rounded-lg">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.approvalRequired}
                  onChange={(e) => handleInputChange('approvalRequired', e.target.checked)}
                  className="w-5 h-5"
                />
                <div>
                  <div className="font-medium">Require Approval for Bookings</div>
                  <div className="text-sm text-gray-600">
                    Admin must approve bookings before they are confirmed
                  </div>
                </div>
              </label>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(STEPS.FLEET_SETUP)}
                className="px-6 py-3 border rounded-lg"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(STEPS.REVIEW)}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        );
      
      case STEPS.REVIEW:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Review & Submit</h2>
              <p className="text-gray-600">Please review your information before submitting</p>
            </div>
            
            <div className="space-y-4">
              <div className="border p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Company Information</h3>
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">Name:</span> {formData.companyName}</p>
                  <p><span className="font-medium">Registration:</span> {formData.registrationNumber}</p>
                  <p><span className="font-medium">Tax ID:</span> {formData.taxId}</p>
                  <p><span className="font-medium">Industry:</span> {formData.industry}</p>
                </div>
              </div>
              
              <div className="border p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Team Members</h3>
                <p className="text-sm">{formData.teamMembers.length} member(s) to be invited</p>
              </div>
              
              <div className="border p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Fleet Vehicles</h3>
                <p className="text-sm">{formData.vehicles.length} vehicle(s) registered</p>
              </div>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
                {error}
              </div>
            )}
            
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <p className="text-sm">
                Your registration will be submitted for verification. This typically takes 2-5 business days.
                You'll receive an email once your account is approved.
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(STEPS.PREFERENCES)}
                className="px-6 py-3 border rounded-lg"
              >
                Back
              </button>
              <button
                onClick={submitRegistration}
                disabled={loading}
                className="flex-1 bg-green-600 text-white p-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Submit Registration'}
              </button>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {Object.values(STEPS).map((step, index) => (
              <div
                key={step}
                className={`w-full h-2 rounded ${
                  Object.values(STEPS).indexOf(currentStep) >= index
                    ? 'bg-blue-600'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
        
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
            {error}
          </div>
        )}
        
        {renderStep()}
      </div>
    </div>
  );
}