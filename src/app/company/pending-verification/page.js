'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';

export default function PendingVerificationPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [company, setCompany] = useState(null);

  useEffect(() => {
    loadCompany();
  }, []);

  const loadCompany = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
      return;
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('company:company_profiles(*)')
      .eq('auth_user_id', user.id)
      .single();

    if (profile?.company) {
      setCompany(profile.company);
      if (profile.company.status === 'active') {
        router.push('/company/dashboard');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-yellow-100 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <svg className="w-10 h-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold mb-4">Verification Pending</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6 text-left space-y-4">
          {company && (
            <div className="border-b pb-4">
              <p className="text-sm text-gray-600">Company Name</p>
              <p className="font-semibold">{company.name}</p>
            </div>
          )}
          
          <div>
            <p className="text-gray-600 mb-4">
              Your company registration is being reviewed by our team. 
              This typically takes 2-5 business days.
            </p>
            
            <div className="bg-blue-50 p-4 rounded-lg text-sm">
              <p className="font-semibold mb-2">What happens next?</p>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Our team reviews your documents</li>
                <li>✓ We verify your company information</li>
                <li>✓ You'll receive an email once approved</li>
                <li>✓ Full access will be granted immediately</li>
              </ul>
            </div>
          </div>
          
          <div className="pt-4">
            <p className="text-sm text-gray-500">
              Need help? Contact support at support@garicare.com
            </p>
          </div>
        </div>
        
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-6 text-blue-600 hover:underline"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}