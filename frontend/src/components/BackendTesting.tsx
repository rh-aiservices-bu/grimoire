import React, { useState, useEffect } from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  Button,
  TextArea,
  Alert,
  AlertActionCloseButton,
  Spinner,
  Title,
  Split,
  SplitItem,
  Form,
  FormGroup,
  Grid,
  GridItem,
  NumberInput,
  ExpandableSection,
  Tabs,
  Tab,
  TabTitleText,
  Modal,
  ModalVariant,
} from '@patternfly/react-core';
import { Project, ModelParameters } from '../types';
import { api } from '../api';
import { GitAuthModal } from './GitAuthModal';

interface BackendTestingProps {
  project: Project;
  onTestComplete?: () => void;
}

export const BackendTesting: React.FC<BackendTestingProps> = ({ project, onTestComplete }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState('chat');
  
  // Chat state
  const [userPrompt, setUserPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Settings state (for modal)
  const [userPromptModal, setUserPromptModal] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [variableInput, setVariableInput] = useState('');
  const [modelParams, setModelParams] = useState<ModelParameters>({
    temperature: 0.7,
    max_len: 1000,
    top_p: 0.9,
    top_k: 50,
  });
  
  // Modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  
  // Authentication state
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    user?: {
      username: string;
      platform: string;
      server_url?: string;
    };
    platform?: string;
    last_used?: string;
    error?: string;
  } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  
  // Git Auth Modal state
  const [isGitAuthModalOpen, setIsGitAuthModalOpen] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  // Collapsible sections state (for modal)
  const [isSystemPromptExpanded, setIsSystemPromptExpanded] = useState(false);
  const [isVariablesExpanded, setIsVariablesExpanded] = useState(false);
  const [isModelParamsExpanded, setIsModelParamsExpanded] = useState(false);

  // Load settings from git on component mount
  useEffect(() => {
    if (project.git_repo_url) {
      loadSettings();
      checkAuthStatus();
    }
  }, [project.id, project.git_repo_url]);

  const parseVariables = (input: string): Record<string, string> => {
    const vars: Record<string, string> = {};
    const lines = input.split('\n');
    lines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        vars[key.trim()] = valueParts.join(':').trim();
      }
    });
    return vars;
  };

  const processTemplateVariables = (text: string, vars: Record<string, string>): string => {
    if (!vars || Object.keys(vars).length === 0) return text;
    
    let processed = text;
    for (const [key, value] of Object.entries(vars)) {
      const pattern = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g');
      processed = processed.replace(pattern, value);
    }
    return processed;
  };

  const handleVariableInputChange = (value: string) => {
    setVariableInput(value);
    const parsedVars = parseVariables(value);
    setVariables(parsedVars);
  };

  const handleTestBackend = async () => {
    if (!userPrompt.trim()) {
      setError('Please enter an input prompt');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setResponse('');

    try {
      // Process template variables in user prompt using current settings
      const processedPrompt = processTemplateVariables(userPrompt, variables);
      
      await api.testBackend(
        project.id,
        {
          prompt: processedPrompt,
          systemPrompt: systemPrompt || undefined,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
          temperature: modelParams.temperature,
          maxLen: modelParams.max_len,
          topP: modelParams.top_p,
          topK: modelParams.top_k,
        },
        (chunk: string) => {
          setResponse(prev => prev + chunk);
        },
        (error: string) => {
          setError(error);
          setIsLoading(false);
        },
        () => {
          setIsLoading(false);
          setSuccess('Backend test completed successfully! Response saved to history.');
          // Notify parent component to refresh history
          if (onTestComplete) {
            onTestComplete();
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setIsLoading(false);
    }
  };

  const handleClearResponse = () => {
    setResponse('');
    setError(null);
    setSuccess(null);
  };

  const checkAuthStatus = async () => {
    setIsCheckingAuth(true);
    try {
      const status = await api.getGitAuthStatus();
      setAuthStatus(status);
    } catch (err) {
      console.error('Failed to check auth status:', err);
      setAuthStatus({
        authenticated: false,
        user: undefined,
        platform: undefined,
        last_used: undefined,
        error: 'Failed to check authentication status'
      });
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const loadSettings = async () => {
    try {
      const settings = await api.getTestSettings(project.id);
      
      // Update state with loaded settings
      if (settings.userPrompt !== undefined) {
        setUserPromptModal(settings.userPrompt);
      }
      if (settings.systemPrompt !== undefined) {
        setSystemPrompt(settings.systemPrompt);
      }
      if (settings.variables) {
        setVariables(settings.variables);
        // Convert variables back to input format
        const variableInputText = Object.entries(settings.variables)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        setVariableInput(variableInputText);
      }
      if (settings.temperature !== undefined || settings.maxLen !== undefined || 
          settings.topP !== undefined || settings.topK !== undefined) {
        setModelParams({
          temperature: settings.temperature ?? 0.7,
          max_len: settings.maxLen ?? 1000,
          top_p: settings.topP ?? 0.9,
          top_k: settings.topK ?? 50,
        });
      }
    } catch (err) {
      console.log('No test settings found in git, using defaults');
      // Keep default values if no settings found
    }
  };

  const handleGitAuth = async (authData: { platform: string; username: string; access_token: string; server_url?: string }) => {
    setIsAuthenticating(true);
    try {
      await api.authenticateGit(authData);
      setIsGitAuthModalOpen(false);
      setSuccess('Git authentication successful!');
      
      // Refresh auth status after successful authentication
      await checkAuthStatus();
    } catch (err) {
      console.error('Git authentication error:', err);
      setError(`Authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSettingsSaving(true);
    try {
      const settingsToSave = {
        userPrompt: userPromptModal || undefined,
        systemPrompt: systemPrompt || undefined,
        variables: Object.keys(variables).length > 0 ? variables : undefined,
        temperature: modelParams.temperature,
        maxLen: modelParams.max_len,
        topP: modelParams.top_p,
        topK: modelParams.top_k,
      };
      
      console.log('Saving settings:', settingsToSave);
      
      const result = await api.saveTestSettings(project.id, settingsToSave);
      
      console.log('Save result:', result);
      
      setIsSettingsModalOpen(false);
      setSuccess(`Settings saved successfully! ${result.commit_url ? 'Commit: ' + result.commit_sha?.substring(0, 7) : ''}`);
      
      // Refresh auth status after successful save
      checkAuthStatus();
    } catch (err) {
      console.error('Settings save error:', err);
      
      // Check if it's an authentication error
      if (err instanceof Error && (
        err.message.includes('authentication') || 
        err.message.includes('token') || 
        err.message.includes('unauthorized') ||
        err.message.includes('401')
      )) {
        setError(
          <div>
            <div>🔐 Authentication Error</div>
            <div>{err.message}</div>
            <div style={{ marginTop: '0.5rem' }}>
              <Button variant="link" onClick={() => setIsGitAuthModalOpen(true)} style={{ padding: 0 }}>
                Re-authenticate with Git
              </Button>
            </div>
          </div>
        );
        // Update auth status to show it's invalid
        setAuthStatus(prev => prev ? { ...prev, authenticated: false } : null);
      } else {
        setError(`Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } finally {
      setIsSettingsSaving(false);
    }
  };

  if (!project.test_backend_url) {
    return (
      <Card>
        <CardTitle>Backend Testing</CardTitle>
        <CardBody>
          <Alert variant="info" title="No backend URL configured">
            <p>
              To test prompts against your backend, please configure a Test Backend URL in the project settings.
            </p>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Backend Testing</CardTitle>
      <CardBody>
        <Split hasGutter style={{ marginBottom: '1rem' }}>
          <SplitItem>
            <div>
              <strong>Backend URL:</strong>
              <br />
              <small>{project.test_backend_url}</small>
            </div>
          </SplitItem>
        </Split>


        <Tabs activeKey={activeTab} onSelect={(_event, tabIndex) => setActiveTab(tabIndex as string)}>
          <Tab eventKey="chat" title={<TabTitleText>Chat</TabTitleText>}>
            <div style={{ padding: '1rem 0' }}>
              {/* Update Settings Button - Top Right */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <Button 
                  variant="secondary" 
                  onClick={() => setIsSettingsModalOpen(true)}
                >
                  Update Settings
                </Button>
              </div>

              <Grid hasGutter>
                {/* Left Side: Input Prompt */}
                <GridItem span={6}>
                  <Title headingLevel="h4" size="md" style={{ marginBottom: '1rem' }}>Input Prompt</Title>
                  <Form>
                    <FormGroup label="Input Prompt" isRequired fieldId="user-prompt">
                      <TextArea
                        isRequired
                        id="user-prompt"
                        name="user-prompt"
                        value={userPrompt || ''}
                        onChange={(_event, value) => setUserPrompt(value)}
                        rows={6}
                        placeholder="Enter your input prompt here. Use {{variable_name}} for template variables."
                      />
                    </FormGroup>
                    
                    {/* Preview section */}
                    {userPrompt && Object.keys(variables).length > 0 && (
                      <Card style={{ marginTop: '1rem', backgroundColor: 'var(--pf-global--palette--blue-50)', maxHeight: '200px' }}>
                        <CardTitle>Preview (with variables)</CardTitle>
                        <CardBody style={{ maxHeight: '150px', overflowY: 'auto' }}>
                          <div style={{ 
                            backgroundColor: 'white', 
                            padding: '0.5rem', 
                            border: '1px solid var(--pf-global--BorderColor--100)',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem'
                          }}>
                            {processTemplateVariables(userPrompt, variables)}
                          </div>
                        </CardBody>
                      </Card>
                    )}

                    <div style={{ marginTop: '1rem' }}>
                      <Button 
                        variant="primary" 
                        onClick={handleTestBackend}
                        isLoading={isLoading}
                        isDisabled={!userPrompt.trim() || isLoading}
                      >
                        {isLoading ? 'Generating...' : 'Generate Response'}
                      </Button>
                      {response && (
                        <Button 
                          variant="secondary" 
                          onClick={handleClearResponse}
                          isDisabled={isLoading}
                          style={{ marginLeft: '0.5rem' }}
                        >
                          Clear Response
                        </Button>
                      )}
                    </div>

                    {error && (
                      <Alert 
                        variant="danger" 
                        title="Backend Test Error"
                        style={{ marginTop: '1rem' }}
                        actionClose={<AlertActionCloseButton onClose={() => setError(null)} />}
                      >
                        {error}
                      </Alert>
                    )}

                    {success && (
                      <Alert 
                        variant="success" 
                        title="Success"
                        style={{ marginTop: '1rem' }}
                        actionClose={<AlertActionCloseButton onClose={() => setSuccess(null)} />}
                      >
                        {success}
                      </Alert>
                    )}
                  </Form>
                </GridItem>
                
                {/* Right Side: Response */}
                <GridItem span={6}>
                  <Title headingLevel="h4" size="md" style={{ marginBottom: '1rem' }}>Response</Title>
                  {response || isLoading ? (
                    <Card style={{ height: 'calc(100vh - 500px)', minHeight: '400px' }}>
                      <CardBody style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {isLoading && (
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                            <Spinner size="sm" style={{ marginRight: '0.5rem' }} />
                            <span>Generating response...</span>
                          </div>
                        )}
                        <div style={{ 
                          flex: 1,
                          padding: '1rem',
                          backgroundColor: '#f5f5f5',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          overflow: 'auto'
                        }}>
                          {response || 'Waiting for response...'}
                        </div>
                      </CardBody>
                    </Card>
                  ) : (
                    <Card style={{ height: 'calc(100vh - 500px)', minHeight: '400px' }}>
                      <CardBody style={{ 
                        height: '100%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: '#6a6e73'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
                          <div>Response will appear here after generation</div>
                        </div>
                      </CardBody>
                    </Card>
                  )}
                </GridItem>
              </Grid>
            </div>
          </Tab>
          
          <Tab eventKey="eval" title={<TabTitleText>Eval</TabTitleText>}>
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6a6e73' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔧</div>
              <div>Evaluation features coming soon...</div>
            </div>
          </Tab>
        </Tabs>

        {/* Settings Modal */}
        <Modal
          variant={ModalVariant.large}
          title="Update Settings"
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          actions={[
            <Button
              key="save"
              variant={authStatus?.authenticated ? "primary" : "secondary"}
              onClick={authStatus?.authenticated ? handleSaveSettings : () => setIsGitAuthModalOpen(true)}
              isLoading={isSettingsSaving}
              isDisabled={isSettingsSaving}
            >
              {isSettingsSaving ? 'Saving...' : 
               authStatus?.authenticated ? 'Save to Git' : 
               'Authenticate to Save'}
            </Button>,
            <Button 
              key="cancel" 
              variant="link" 
              onClick={() => setIsSettingsModalOpen(false)}
            >
              Cancel
            </Button>
          ]}
        >
          <div style={{ padding: '1rem' }}>
            {/* Git Authentication Status */}
            {project.git_repo_url && (
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: authStatus?.authenticated ? '#f0f8ff' : '#fff8f0',
                border: `1px solid ${authStatus?.authenticated ? '#2196F3' : '#FF9800'}`,
                borderRadius: '4px',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isCheckingAuth ? (
                    <>
                      <Spinner size="sm" />
                      <span>Checking authentication...</span>
                    </>
                  ) : authStatus?.authenticated ? (
                    <>
                      <span style={{ color: '#4CAF50' }}>🔐 ✅</span>
                      <span>
                        <strong>Git:</strong> @{authStatus.user?.username} ({authStatus.user?.platform})
                      </span>
                      {authStatus.last_used && (
                        <span style={{ color: '#666', fontSize: '0.875rem' }}>
                          | Last used: {new Date(authStatus.last_used).toLocaleString()}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#FF5722' }}>🔐 ❌</span>
                      <span>
                        <strong>Git:</strong> Not authenticated or expired
                      </span>
                      {authStatus?.user && (
                        <span style={{ color: '#666', fontSize: '0.875rem' }}>
                          | Last: @{authStatus.user.username} ({authStatus.user.platform})
                        </span>
                      )}
                      <Button 
                        variant="link" 
                        onClick={() => setIsGitAuthModalOpen(true)}
                        style={{ padding: 0, marginLeft: '0.5rem' }}
                      >
                        Re-authenticate
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            <Form>
              <FormGroup label="User Prompt" fieldId="modal-user-prompt">
                <TextArea
                  id="modal-user-prompt"
                  name="modal-user-prompt"
                  value={userPromptModal || ''}
                  onChange={(_event, value) => setUserPromptModal(value)}
                  rows={4}
                  placeholder="User prompt. Use {{variable_name}} for template variables."
                />
              </FormGroup>

              <FormGroup label="System Prompt" fieldId="modal-system-prompt">
                <TextArea
                  id="modal-system-prompt"
                  name="modal-system-prompt"
                  value={systemPrompt || ''}
                  onChange={(_event, value) => setSystemPrompt(value)}
                  rows={3}
                  placeholder="System prompt. Use {{variable_name}} for template variables."
                />
              </FormGroup>

              <FormGroup 
                label="Variables" 
                fieldId="modal-variables"
              >
              <div style={{ fontSize: '0.875rem', color: '#6a6e73', marginBottom: '0.5rem' }}>
                Enter variables as key: value pairs, one per line. Use {'{'}key{'}'} in prompts to reference variables.
              </div>
              <TextArea
                id="modal-variables"
                name="modal-variables"
                value={variableInput || ''}
                onChange={(_event, value) => handleVariableInputChange(value)}
                rows={3}
                placeholder="name: John Doe&#10;age: 30&#10;city: New York"
              />
            </FormGroup>

            <Grid hasGutter style={{ marginBottom: '1rem' }}>
              <GridItem span={6}>
                <FormGroup label="Temperature" fieldId="modal-temperature">
                  <NumberInput
                    value={modelParams.temperature}
                    min={0}
                    max={2}
                    step={0.1}
                    onMinus={() => setModelParams(prev => ({ 
                      ...prev, 
                      temperature: Math.max(0, prev.temperature - 0.1) 
                    }))}
                    onPlus={() => setModelParams(prev => ({ 
                      ...prev, 
                      temperature: Math.min(2, prev.temperature + 0.1) 
                    }))}
                    onChange={(event) => {
                      const value = parseFloat((event.target as HTMLInputElement).value) || 0;
                      setModelParams(prev => ({ ...prev, temperature: value }));
                    }}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label="Max Length" fieldId="modal-max-len">
                  <NumberInput
                    value={modelParams.max_len}
                    min={1}
                    max={4000}
                    step={100}
                    onMinus={() => setModelParams(prev => ({ 
                      ...prev, 
                      max_len: Math.max(1, prev.max_len - 100) 
                    }))}
                    onPlus={() => setModelParams(prev => ({ 
                      ...prev, 
                      max_len: Math.min(4000, prev.max_len + 100) 
                    }))}
                    onChange={(event) => {
                      const value = parseInt((event.target as HTMLInputElement).value) || 1;
                      setModelParams(prev => ({ ...prev, max_len: value }));
                    }}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
            
            <Grid hasGutter style={{ marginBottom: '1.5rem' }}>
              <GridItem span={6}>
                <FormGroup label="Top P" fieldId="modal-top-p">
                  <NumberInput
                    value={modelParams.top_p}
                    min={0}
                    max={1}
                    step={0.1}
                    onMinus={() => setModelParams(prev => ({ 
                      ...prev, 
                      top_p: Math.max(0, prev.top_p - 0.1) 
                    }))}
                    onPlus={() => setModelParams(prev => ({ 
                      ...prev, 
                      top_p: Math.min(1, prev.top_p + 0.1) 
                    }))}
                    onChange={(event) => {
                      const value = parseFloat((event.target as HTMLInputElement).value) || 0;
                      setModelParams(prev => ({ ...prev, top_p: value }));
                    }}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label="Top K" fieldId="modal-top-k">
                  <NumberInput
                    value={modelParams.top_k}
                    min={1}
                    max={100}
                    step={5}
                    onMinus={() => setModelParams(prev => ({ 
                      ...prev, 
                      top_k: Math.max(1, prev.top_k - 5) 
                    }))}
                    onPlus={() => setModelParams(prev => ({ 
                      ...prev, 
                      top_k: Math.min(100, prev.top_k + 5) 
                    }))}
                    onChange={(event) => {
                      const value = parseInt((event.target as HTMLInputElement).value) || 1;
                      setModelParams(prev => ({ ...prev, top_k: value }));
                    }}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
            
            {/* Modal Actions */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '0.5rem', 
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--pf-global--BorderColor--100)'
            }}>
              <Button 
                variant="link" 
                onClick={() => setIsSettingsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveSettings}
                isLoading={isSettingsSaving}
                isDisabled={isSettingsSaving}
              >
                {isSettingsSaving ? 'Saving...' : 'Save to Git'}
              </Button>
            </div>
            </Form>
          </div>
        </Modal>
        
        {/* Git Auth Modal */}
        <GitAuthModal
          isOpen={isGitAuthModalOpen}
          onClose={() => setIsGitAuthModalOpen(false)}
          onSubmit={handleGitAuth}
          isAuthenticating={isAuthenticating}
        />
      </CardBody>
    </Card>
  );
};