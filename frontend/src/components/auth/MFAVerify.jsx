import React, { useState } from 'react';
import { Alert, Button, Card, Input, Spinner, LinkButton } from '../ui';
import './MFAVerify.css';

const MFAVerify = ({ email, onVerify }) => {
  const [token, setToken] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!token) {
      setError('Please enter a verification code');
      return;
    }
    
    if (!isBackupCode && token.length !== 6) {
      setError('Verification code must be 6 digits');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/mfa/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          token: token.trim(),
          isBackupCode
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Call the parent component's handler with the authentication result
        onVerify(data);
      } else {
        setError(data.message || 'Invalid verification code');
      }
    } catch (err) {
      setError('Server error during verification');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto p-6">
      <div className="text-center mb-6">
        <div className="mfa-icon mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold">Two-Factor Verification</h2>
        <p className="text-gray-600 mt-2">
          Enter the {isBackupCode ? 'backup code' : '6-digit code'} from your authenticator app
        </p>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <Input
            type="text"
            placeholder={isBackupCode ? "Enter backup code" : "Enter 6-digit code"}
            value={token}
            onChange={(e) => setToken(isBackupCode ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            inputMode={isBackupCode ? "text" : "numeric"}
            maxLength={isBackupCode ? 9 : 6}
            autoFocus
            className="text-center tracking-wider text-lg"
          />
        </div>

        <Button 
          type="submit" 
          disabled={loading}
          className="w-full mb-4"
        >
          {loading ? <Spinner size="sm" /> : 'Verify'}
        </Button>
      </form>

      <div className="text-center">
        <LinkButton 
          onClick={() => setIsBackupCode(!isBackupCode)}
          className="text-sm"
        >
          {isBackupCode ? "Use authenticator code instead" : "Use backup code instead"}
        </LinkButton>
      </div>

      <div className="text-center mt-4 text-sm text-gray-500">
        <p>Verifying for: {email}</p>
      </div>
    </Card>
  );
};

export default MFAVerify;
