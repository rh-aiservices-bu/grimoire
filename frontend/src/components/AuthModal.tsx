import React, { useState } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextInput,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Alert,
  AlertVariant,
  Tab,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core';
import { api } from '../api';
import { UserSession } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (session: UserSession) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resetForm = () => {
    setLoginEmail('');
    setLoginPassword('');
    setRegisterEmail('');
    setRegisterName('');
    setRegisterPassword('');
    setConfirmPassword('');
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await api.login({
        email: loginEmail,
        password: loginPassword,
      });
      
      onAuthenticated(session);
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerEmail || !registerName || !registerPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (registerPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (registerPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await api.register({
        email: registerEmail,
        name: registerName,
        password: registerPassword,
      });
      
      onAuthenticated(session);
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Authentication"
      isOpen={isOpen}
      onClose={handleClose}
    >
      <ModalHeader />
      <ModalBody>
        <Tabs
          activeKey={activeTab}
          onSelect={(_, tabIndex) => {
            setActiveTab(tabIndex as 'login' | 'register');
            setError('');
          }}
        >
          <Tab eventKey="login" title={<TabTitleText>Login</TabTitleText>}>
            <Form style={{ marginTop: '1rem' }}>
              <FormGroup label="Email" isRequired fieldId="login-email">
                <TextInput
                  isRequired
                  type="email"
                  id="login-email"
                  name="login-email"
                  value={loginEmail}
                  onChange={(_event, value) => setLoginEmail(value)}
                  placeholder="your@email.com"
                />
              </FormGroup>
              <FormGroup label="Password" isRequired fieldId="login-password">
                <TextInput
                  isRequired
                  type="password"
                  id="login-password"
                  name="login-password"
                  value={loginPassword}
                  onChange={(_event, value) => setLoginPassword(value)}
                />
              </FormGroup>
            </Form>
          </Tab>
          <Tab eventKey="register" title={<TabTitleText>Register</TabTitleText>}>
            <Form style={{ marginTop: '1rem' }}>
              <FormGroup label="Name" isRequired fieldId="register-name">
                <TextInput
                  isRequired
                  type="text"
                  id="register-name"
                  name="register-name"
                  value={registerName}
                  onChange={(_event, value) => setRegisterName(value)}
                  placeholder="Your full name"
                />
              </FormGroup>
              <FormGroup label="Email" isRequired fieldId="register-email">
                <TextInput
                  isRequired
                  type="email"
                  id="register-email"
                  name="register-email"
                  value={registerEmail}
                  onChange={(_event, value) => setRegisterEmail(value)}
                  placeholder="your@email.com"
                />
              </FormGroup>
              <FormGroup label="Password" isRequired fieldId="register-password">
                <TextInput
                  isRequired
                  type="password"
                  id="register-password"
                  name="register-password"
                  value={registerPassword}
                  onChange={(_event, value) => setRegisterPassword(value)}
                  placeholder="At least 6 characters"
                />
              </FormGroup>
              <FormGroup label="Confirm Password" isRequired fieldId="confirm-password">
                <TextInput
                  isRequired
                  type="password"
                  id="confirm-password"
                  name="confirm-password"
                  value={confirmPassword}
                  onChange={(_event, value) => setConfirmPassword(value)}
                />
              </FormGroup>
            </Form>
          </Tab>
        </Tabs>

        {error && (
          <Alert variant={AlertVariant.danger} title="Error" style={{ marginTop: '1rem' }}>
            {error}
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button 
          key="submit" 
          variant="primary" 
          onClick={activeTab === 'login' ? handleLogin : handleRegister}
          isLoading={loading}
        >
          {activeTab === 'login' ? 'Login' : 'Register'}
        </Button>
        <Button key="cancel" variant="link" onClick={handleClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};