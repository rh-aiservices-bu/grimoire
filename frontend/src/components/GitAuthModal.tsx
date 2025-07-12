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
  FormSelect,
  FormSelectOption,
  Spinner,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';

interface GitAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { platform: string; username: string; access_token: string; server_url?: string }) => Promise<void>;
  isAuthenticating?: boolean;
}

export const GitAuthModal: React.FC<GitAuthModalProps> = ({ isOpen, onClose, onSubmit, isAuthenticating = false }) => {
  const [platform, setPlatform] = useState('github');
  const [username, setUsername] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');

  const handleSubmit = async () => {
    const requiresServerUrl = platform === 'gitlab' || platform === 'gitea';
    if (platform && username && accessToken && (!requiresServerUrl || serverUrl)) {
      const authData: { platform: string; username: string; access_token: string; server_url?: string } = {
        platform,
        username,
        access_token: accessToken
      };
      
      if (requiresServerUrl && serverUrl) {
        authData.server_url = serverUrl;
      }
      
      await onSubmit(authData);
      // Only clear form and close if authentication was successful
      // The parent component will handle closing the modal on success
      if (!isAuthenticating) {
        setPlatform('github');
        setUsername('');
        setAccessToken('');
        setServerUrl('');
      }
    }
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Git Authentication"
      isOpen={isOpen}
      onClose={onClose}
    >
      <ModalHeader />
      <ModalBody>
        <p style={{ marginBottom: '1rem' }}>
          To enable git integration for production prompts, please authenticate with your git platform.
        </p>
        <Form>
          <FormGroup label="Git Platform" isRequired fieldId="git-platform">
            <FormSelect
              value={platform}
              onChange={(_event, value) => setPlatform(value)}
              id="git-platform"
              name="git-platform"
            >
              <FormSelectOption key="github" value="github" label="GitHub" />
              <FormSelectOption key="gitlab" value="gitlab" label="GitLab" />
              <FormSelectOption key="gitea" value="gitea" label="Gitea" />
            </FormSelect>
          </FormGroup>
          
          {(platform === 'gitlab' || platform === 'gitea') && (
            <FormGroup 
              label="Server URL" 
              isRequired={platform === 'gitea'} 
              fieldId="git-server-url"
            >
              <TextInput
                type="text"
                id="git-server-url"
                name="git-server-url"
                value={serverUrl}
                onChange={(_event, value) => setServerUrl(value)}
                placeholder={
                  platform === 'gitlab' 
                    ? 'https://gitlab.example.com (leave empty for gitlab.com)'
                    : 'https://git.example.com (required for Gitea)'
                }
              />
              <HelperText>
                <HelperTextItem>
                  {platform === 'gitlab' 
                    ? 'Leave empty to use gitlab.com, or provide your self-hosted GitLab URL'
                    : 'Provide your Gitea server URL (required for Gitea)'
                  }
                </HelperTextItem>
              </HelperText>
            </FormGroup>
          )}
          
          <FormGroup label="Username" isRequired fieldId="git-username">
            <TextInput
              isRequired
              type="text"
              id="git-username"
              name="git-username"
              value={username}
              onChange={(_event, value) => setUsername(value)}
              placeholder="Your git username"
            />
          </FormGroup>
          <FormGroup label="Access Token" isRequired fieldId="git-token">
            <TextInput
              isRequired
              type="password"
              id="git-token"
              name="git-token"
              value={accessToken}
              onChange={(_event, value) => setAccessToken(value)}
              placeholder="Personal access token"
            />
          </FormGroup>
        </Form>
        <div style={{ marginTop: '1rem', fontSize: '14px', color: '#6a6e73' }}>
          <p><strong>How to get your access token:</strong></p>
          <ul style={{ marginLeft: '1rem' }}>
            <li><strong>GitHub:</strong> Settings → Developer settings → Personal access tokens → Generate new token</li>
            <li><strong>GitLab:</strong> User Settings → Access Tokens → Add a personal access token</li>
            <li><strong>Gitea:</strong> User Settings → Applications → Generate New Token</li>
          </ul>
          <p style={{ marginTop: '0.5rem' }}>
            <strong>Required permissions:</strong> repo (full repository access)
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button 
          key="authenticate" 
          variant="primary" 
          onClick={handleSubmit}
          isDisabled={isAuthenticating || !platform || !username || !accessToken || ((platform === 'gitlab' || platform === 'gitea') && platform === 'gitea' && !serverUrl)}
          icon={isAuthenticating ? <Spinner size="sm" /> : undefined}
        >
          {isAuthenticating ? 'Authenticating...' : 'Authenticate'}
        </Button>
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={isAuthenticating}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};