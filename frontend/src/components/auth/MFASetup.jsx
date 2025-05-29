import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Alert, Button, Card, Input, Spinner } from '../ui';
import QRCode from 'qrcode.react';
import './MFASetup.css';

const MFASetup = () => {
  const { user } = useAuth();
  const [step, setStep] = useState('initial');
  const [qrCode, setQRCode] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Start MFA setup process
  const handleSetupStart = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setQRCode(data.qrCode);
        setManualKey(data.manualEntryKey);
        setBackupCodes(data.backupCodes);
        setStep('setup');
      } else {
        setError(data.message || 'Failed to setup MFA');
      }
    } catch (err) {
      setError('Server error while setting up MFA');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Verify token and enable MFA
  const handleVerify = async (e) => {
    e.preventDefault();
    if (token.length !== 6) {
      setError('Verification code must be 6 digits');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          token,
          backupCodes
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess('MFA enabled successfully!');
        setStep('success');
        // Force refresh of user data to get updated MFA status
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setError(data.message || 'Failed to verify code');
      }
    } catch (err) {
      setError('Server error during verification');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderInitialStep = () => (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Two-Factor Authentication</h2>
      <p className="mb-6">
        Enhance your account security by enabling two-factor authentication.
      </p>
      <Button 
        onClick={handleSetupStart}
        disabled={loading}
      >
        {loading ? <Spinner size="sm" /> : 'Set up 2FA'}
      </Button>
    </div>
  );

  const renderSetupStep = () => (
    <div>
      <h2 className="text-2xl font-bold mb-4">Set up Two-Factor Authentication</h2>
      
      <div className="mb-6">
        <h3 className="font-semibold mb-2">Step 1: Scan QR Code</h3>
        <p className="mb-4">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).
        </p>
        <div className="qr-code-container mb-4">
          {qrCode && <QRCode value={qrCode} size={200} />}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold mb-2">Step 2: Manual Entry (if needed)</h3>
        <p className="mb-2">If you can't scan the QR code, enter this key manually:</p>
        <div className="bg-gray-100 p-2 rounded text-center mb-4 font-mono">
          {manualKey}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold mb-2">Step 3: Save Backup Codes</h3>
        <p className="mb-2">
          Store these backup codes in a safe place. You'll need them if you lose access to your authenticator app.
        </p>
        <div className="backup-codes-container grid grid-cols-2 gap-2 mb-4">
          {backupCodes.map((code, index) => (
            <div key={index} className="bg-gray-100 p-2 rounded text-center font-mono">
              {code}
            </div>
          ))}
        </div>
        <Button 
          variant="secondary" 
          size="sm"
          onClick={() => {
            const codesText = backupCodes.join('\n');
            navigator.clipboard.writeText(codesText);
            setSuccess('Backup codes copied to clipboard!');
            setTimeout(() => setSuccess(''), 3000);
          }}
        >
          Copy Backup Codes
        </Button>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold mb-2">Step 4: Verify Setup</h3>
        <p className="mb-4">
          Enter the 6-digit code from your authenticator app to complete setup.
        </p>
        <form onSubmit={handleVerify}>
          <div className="mb-4">
            <Input
              type="text"
              placeholder="Enter 6-digit code"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength="6"
            />
          </div>
          <Button 
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? <Spinner size="sm" /> : 'Verify & Enable 2FA'}
          </Button>
        </form>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="text-center">
      <div className="success-icon mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold mb-4">Two-Factor Authentication Enabled!</h2>
      <p className="mb-6">
        Your account is now protected with an additional layer of security.
      </p>
      <Button onClick={() => window.location.href = '/profile'}>
        Return to Profile
      </Button>
    </div>
  );

  return (
    <Card className="max-w-lg mx-auto p-6">
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {success && <Alert type="success" className="mb-4">{success}</Alert>}
      
      {step === 'initial' && renderInitialStep()}
      {step === 'setup' && renderSetupStep()}
      {step === 'success' && renderSuccessStep()}
    </Card>
  );
};

export default MFASetup;
