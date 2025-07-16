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
  Badge,
} from '@patternfly/react-core';
import { Project, ModelParameters } from '../../types';
import { api } from '../../api';
import { GitAuthModal } from '../modals';

interface BackendTestingProps {
  project: Project;
}

export const BackendTesting: React.FC<BackendTestingProps> = ({ project }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState('chat');
  
  // Chat state
  const [userPrompt, setUserPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Eval state
  const [dataset, setDataset] = useState('huggingface://datasets/llamastack/simpleqa?split=train');
  const [evalConfig, setEvalConfig] = useState('');
  const [evalResults, setEvalResults] = useState<any>(null);
  const [isEvalRunning, setIsEvalRunning] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  
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

  // Initialize eval config
  useEffect(() => {
    if (!evalConfig) {
      const defaultEvalConfig = {
        scoring_params: {
          "llm-as-judge::base": {
            "judge_model": project.provider_id,
            "prompt_template": "{{judge_prompt}}",
            "type": "llm_as_judge",
            "judge_score_regexes": ["Answer: (A|B|C|D|E)"]
          },
          "basic::subset_of": null
        },
        tests: [
          {
            prompt: "Sample test",
            expected_result: "sample test"
          }
        ],
        judge_prompt: `Given a QUESTION and GENERATED_RESPONSE and EXPECTED_RESPONSE.

Compare the factual content of the GENERATED_RESPONSE with the EXPECTED_RESPONSE. Ignore any differences in style, grammar, or punctuation.
  The GENERATED_RESPONSE may either be a subset or superset of the EXPECTED_RESPONSE, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:
  (A) The GENERATED_RESPONSE is a subset of the EXPECTED_RESPONSE and is fully consistent with it.
  (B) The GENERATED_RESPONSE is a superset of the EXPECTED_RESPONSE and is fully consistent with it.
  (C) The GENERATED_RESPONSE contains all the same details as the EXPECTED_RESPONSE.
  (D) There is a disagreement between the GENERATED_RESPONSE and the EXPECTED_RESPONSE.
  (E) The answers differ, but these differences don't matter from the perspective of factuality.

Give your answer in the format "Answer: One of ABCDE, Explanation: ".

Your actual task:

QUESTION: {input_query}
GENERATED_RESPONSE: {generated_answer}
EXPECTED_RESPONSE: {expected_answer}`
      };
      setEvalConfig(JSON.stringify(defaultEvalConfig, null, 2));
    }
  }, [project.provider_id, evalConfig]);

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
          setSuccess('Backend test completed successfully! Response saved to backend test history.');
          // Note: We don't call onTestComplete here to avoid creating Development/Git History cards
          // Backend tests are saved to a separate BackendTestHistory table
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

  const handleRunEval = async () => {
    if (!dataset.trim()) {
      setEvalError('Please enter a dataset');
      return;
    }

    if (!evalConfig.trim()) {
      setEvalError('Please enter eval configuration');
      return;
    }

    if (!project.test_backend_url) {
      setEvalError('No test backend URL configured for this project');
      return;
    }

    setIsEvalRunning(true);
    setEvalError(null);
    setEvalResults(null);

    try {
      let parsedEvalConfig;
      try {
        parsedEvalConfig = JSON.parse(evalConfig);
      } catch (err) {
        setEvalError('Invalid JSON in eval configuration');
        setIsEvalRunning(false);
        return;
      }

      const evalRequest = {
        dataset: dataset,
        eval_config: parsedEvalConfig,
        backend_url: project.test_backend_url,
        user_prompt: userPromptModal || 'Tell me about {{topic}}',
        system_prompt: systemPrompt || 'You are a helpful assistant',
        variables: variables,
        temperature: modelParams.temperature,
        max_len: modelParams.max_len,
        top_p: modelParams.top_p,
        top_k: modelParams.top_k
      };

      console.log('Sending eval request:', evalRequest);

      const response = await api.runEvaluation(project.id, evalRequest);
      setEvalResults(response);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsEvalRunning(false);
    }
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
            <div style={{ padding: '2rem' }}>
              <Grid hasGutter>
                <GridItem span={6}>
                  <Card>
                    <CardTitle>Dataset</CardTitle>
                    <CardBody>
                      <Form>
                        <FormGroup label="Dataset URL" isRequired>
                          <TextArea
                            value={dataset}
                            onChange={(_, value) => setDataset(value)}
                            placeholder="huggingface://datasets/llamastack/simpleqa?split=train"
                            rows={1}
                            style={{ 
                              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                              fontSize: '0.9rem',
                              resize: 'none'
                            }}
                          />
                        </FormGroup>
                      </Form>
                    </CardBody>
                  </Card>
                  
                  <Card style={{ marginTop: '1rem' }}>
                    <CardTitle>Llamastack eval config</CardTitle>
                    <CardBody>
                      <Form>
                        <FormGroup>
                          <TextArea
                            value={evalConfig}
                            onChange={(_, value) => setEvalConfig(value)}
                            placeholder="Enter eval configuration in JSON format"
                            rows={20}
                            style={{ 
                              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                              fontSize: '0.9rem'
                            }}
                          />
                        </FormGroup>
                      </Form>
                    </CardBody>
                  </Card>
                  
                  <div style={{ marginTop: '1rem' }}>
                    <Button 
                      variant="primary" 
                      onClick={handleRunEval}
                      isLoading={isEvalRunning}
                      isDisabled={isEvalRunning}
                    >
                      {isEvalRunning ? 'Running Eval...' : 'Run eval'}
                    </Button>
                  </div>
                  
                  {evalError && (
                    <Alert variant="danger" title="Error" className="pf-u-mt-md">
                      <div>{evalError}</div>
                      {evalError.includes("scoring endpoint not available") && (
                        <div style={{ marginTop: '1rem' }}>
                          <strong>How to fix:</strong>
                          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                            <li>Enable the scoring service in your LlamaStack server configuration</li>
                            <li>Or use a different LlamaStack server that supports evaluation</li>
                            <li>Check the LlamaStack documentation for scoring service setup</li>
                          </ul>
                        </div>
                      )}
                    </Alert>
                  )}
                </GridItem>
                
                <GridItem span={6}>
                  <Card>
                    <CardTitle>Eval results</CardTitle>
                    <CardBody>
                      {isEvalRunning ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                          <Spinner size="lg" />
                          <div style={{ marginTop: '1rem' }}>Running evaluation...</div>
                        </div>
                      ) : evalResults ? (
                        <div>
                          <div style={{ marginBottom: '1rem' }}>
                            <strong>Summary:</strong>
                            {evalResults.status === 'failed' ? (
                              <div style={{ color: 'var(--pf-global--danger-color--100)' }}>Evaluation failed</div>
                            ) : (
                              <>
                                <div>Total tests: {evalResults.total_tests}</div>
                                {evalResults.avg_score !== null && evalResults.avg_score !== undefined && (
                                  <div>Average score: {evalResults.avg_score.toFixed(2)}</div>
                                )}
                              </>
                            )}
                            <div>Status: {evalResults.status}</div>
                          </div>
                          
                          <div style={{ marginBottom: '1rem' }}>
                            <strong>Detailed Results:</strong>
                          </div>
                          
                          <div style={{ maxHeight: '700px', overflowY: 'auto' }}>
                            {evalResults.results.length > 0 && evalResults.results[0].scoring_results && (
                              Object.entries(evalResults.results[0].scoring_results).map(([funcName, _]: [string, any]) => (
                                <Card key={funcName} style={{ marginBottom: '1.5rem' }}>
                                  <CardTitle>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                      <Badge variant="secondary">{funcName}</Badge>
                                      {evalResults.summary && evalResults.summary[funcName] && (
                                        <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                                          {Object.entries(evalResults.summary[funcName]).map(([key, value]) => (
                                            <span key={key} style={{ marginRight: '1rem' }}>
                                              {key}: {JSON.stringify(value)}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </CardTitle>
                                  <CardBody>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                      {evalResults.results.map((result: any, index: number) => (
                                        <Card key={index} isCompact style={{ border: '1px solid var(--pf-global--BorderColor--200)' }}>
                                          <CardBody>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <Badge variant="filled" style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>Test {index + 1}</Badge>
                                                <Badge variant="outline" style={{ fontSize: '0.875rem' }}>
                                                  Score: {result.scoring_results && result.scoring_results[funcName] 
                                                    ? result.scoring_results[funcName].score 
                                                    : 'N/A'}
                                                </Badge>
                                              </div>
                                            </div>
                                            
                                            <Grid hasGutter>
                                              <GridItem span={4}>
                                                <div style={{ 
                                                  padding: '0.75rem',
                                                  backgroundColor: 'var(--pf-global--palette--blue-50)',
                                                  borderRadius: '4px',
                                                  border: '1px solid var(--pf-global--palette--blue-200)'
                                                }}>
                                                  <div style={{ 
                                                    fontWeight: 'bold', 
                                                    fontSize: '0.875rem', 
                                                    marginBottom: '0.5rem',
                                                    color: 'var(--pf-global--palette--blue-700)'
                                                  }}>
                                                    Input
                                                  </div>
                                                  <div style={{ 
                                                    fontSize: '0.875rem',
                                                    lineHeight: '1.4',
                                                    whiteSpace: 'pre-wrap',
                                                    wordWrap: 'break-word'
                                                  }}>
                                                    {result.input_query}
                                                  </div>
                                                </div>
                                              </GridItem>
                                              
                                              <GridItem span={4}>
                                                <div style={{ 
                                                  padding: '0.75rem',
                                                  backgroundColor: 'var(--pf-global--palette--green-50)',
                                                  borderRadius: '4px',
                                                  border: '1px solid var(--pf-global--palette--green-200)'
                                                }}>
                                                  <div style={{ 
                                                    fontWeight: 'bold', 
                                                    fontSize: '0.875rem', 
                                                    marginBottom: '0.5rem',
                                                    color: 'var(--pf-global--palette--green-700)'
                                                  }}>
                                                    Generated
                                                  </div>
                                                  <div style={{ 
                                                    fontSize: '0.875rem',
                                                    lineHeight: '1.4',
                                                    whiteSpace: 'pre-wrap',
                                                    wordWrap: 'break-word'
                                                  }}>
                                                    {result.generated_answer}
                                                  </div>
                                                </div>
                                              </GridItem>
                                              
                                              <GridItem span={4}>
                                                <div style={{ 
                                                  padding: '0.75rem',
                                                  backgroundColor: 'var(--pf-global--palette--orange-50)',
                                                  borderRadius: '4px',
                                                  border: '1px solid var(--pf-global--palette--orange-200)'
                                                }}>
                                                  <div style={{ 
                                                    fontWeight: 'bold', 
                                                    fontSize: '0.875rem', 
                                                    marginBottom: '0.5rem',
                                                    color: 'var(--pf-global--palette--orange-700)'
                                                  }}>
                                                    Expected
                                                  </div>
                                                  <div style={{ 
                                                    fontSize: '0.875rem',
                                                    lineHeight: '1.4',
                                                    whiteSpace: 'pre-wrap',
                                                    wordWrap: 'break-word'
                                                  }}>
                                                    {result.expected_answer}
                                                  </div>
                                                </div>
                                              </GridItem>
                                            </Grid>
                                            
                                            {funcName === 'llm-as-judge::base' && result.scoring_results && result.scoring_results[funcName] && (
                                              <div style={{ 
                                                marginTop: '1rem',
                                                padding: '0.75rem',
                                                backgroundColor: 'var(--pf-global--palette--purple-50)',
                                                borderRadius: '4px',
                                                border: '1px solid var(--pf-global--palette--purple-200)'
                                              }}>
                                                <div style={{ 
                                                  fontWeight: 'bold', 
                                                  fontSize: '0.875rem', 
                                                  marginBottom: '0.5rem',
                                                  color: 'var(--pf-global--palette--purple-700)'
                                                }}>
                                                  Judge Feedback
                                                </div>
                                                <div style={{ 
                                                  fontSize: '0.875rem',
                                                  lineHeight: '1.4',
                                                  whiteSpace: 'pre-wrap',
                                                  wordWrap: 'break-word'
                                                }}>
                                                  {result.scoring_results[funcName].judge_feedback || result.scoring_results[funcName].explanation || 'No feedback'}
                                                </div>
                                              </div>
                                            )}
                                          </CardBody>
                                        </Card>
                                      ))}
                                    </div>
                                  </CardBody>
                                </Card>
                              ))
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#6a6e73' }}>
                          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
                          <div>Run an evaluation to see results here</div>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </GridItem>
              </Grid>
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