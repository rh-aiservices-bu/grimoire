import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  GridItem,
  Card,
  CardTitle,
  CardBody,
  Form,
  FormGroup,
  TextInput,
  TextArea,
  Button,
  Spinner,
  Alert,
  Title,
  Split,
  SplitItem,
  NumberInput,
  Tabs,
  Tab,
  TabTitleText,
  Stack,
  StackItem,
  Flex,
  FlexItem,
  FormSelect,
  FormSelectOption,
  Tooltip,
  EmptyState,
  EmptyStateBody,
  ClipboardCopy,
} from '@patternfly/react-core';
import { PlusIcon, ClockIcon } from '@patternfly/react-icons';
import { Project, PromptHistory, ModelParameters, GitUser } from '../../types';
import { api } from '../../api';
import { HistoryLog, BackendTesting } from '../../components/shared';
import { ProjectEditModal, DeleteProjectModal, ApiDocumentationModal } from '../../components/modals';

interface PromptExperimentViewProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate?: (updatedProject: Project) => void;
  onProjectDelete?: () => void;
  onProjectSelect?: (project: Project) => void;
  allProjects?: Project[];
  onCreateNew?: () => void;
  gitUser?: GitUser | null;
  onGitAuth?: () => void;
  onNotification?: (notification: {
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }) => void;
}

// Message interface for the new playground design
interface Message {
  id: string;
  role: 'System' | 'User' | 'Assistant';
  content: string;
}

// Project state cache interface
interface ProjectState {
  messages: Message[];
  variables: Record<string, string>;
  variableInput: string;
  modelParams: ModelParameters;
  response: string;
  thoughtProcess: string;
  historyViewMode: 'development' | 'backend' | 'prod';
  footerInput: string;
}

export const PromptExperimentView: React.FC<PromptExperimentViewProps> = ({
  project,
  onBack,
  onProjectUpdate,
  onProjectDelete,
  onProjectSelect,
  allProjects = [],
  onCreateNew,
  gitUser,
  onGitAuth,
  onNotification,
}) => {
  // Project-specific state cache using useRef to persist across re-renders
  const projectStateCache = useRef<Map<number, ProjectState>>(new Map());
  const MAX_CACHED_PROJECTS = 10; // Limit cache size to prevent memory growth
  
  // Default state for new projects
  const getDefaultProjectState = (): ProjectState => ({
    messages: [{
      id: '1',
      role: 'User',
      content: ''
    }],
    variables: {},
    variableInput: '',
    modelParams: {
      temperature: 1.0,
      max_len: 512,
      top_p: 1.0,
      top_k: 50,
    },
    response: '',
    thoughtProcess: '',
    historyViewMode: 'development',
    footerInput: '',
  });
  
  // Get state for current project
  const getCurrentProjectState = (): ProjectState => {
    if (!projectStateCache.current.has(project.id)) {
      projectStateCache.current.set(project.id, getDefaultProjectState());
    }
    return projectStateCache.current.get(project.id)!;
  };
  
  // Update state for current project
  const updateCurrentProjectState = (updates: Partial<ProjectState>) => {
    const currentState = getCurrentProjectState();
    const newState = { ...currentState, ...updates };
    projectStateCache.current.set(project.id, newState);
    
    // Clean up cache if it gets too large
    if (projectStateCache.current.size > MAX_CACHED_PROJECTS) {
      const entries = Array.from(projectStateCache.current.entries());
      // Remove the oldest entry (first in the map)
      const [oldestProjectId] = entries[0];
      projectStateCache.current.delete(oldestProjectId);
    }
  };
  
  // Initialize state from cache or defaults
  const initialState = getCurrentProjectState();
  
  const [messages, setMessages] = useState<Message[]>(initialState.messages);
  const [variables, setVariables] = useState<Record<string, string>>(initialState.variables);
  const [variableInput, setVariableInput] = useState(initialState.variableInput);
  const [modelParams, setModelParams] = useState<ModelParameters>(initialState.modelParams);
  const [response, setResponse] = useState(initialState.response);
  const [thoughtProcess, setThoughtProcess] = useState(initialState.thoughtProcess);
  const [historyViewMode, setHistoryViewMode] = useState<'development' | 'backend' | 'prod'>(initialState.historyViewMode);
  const [footerInput, setFooterInput] = useState(initialState.footerInput);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<PromptHistory[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isApiDocModalOpen, setIsApiDocModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('experiment');
  const [currentProject, setCurrentProject] = useState<Project>(project);

  useEffect(() => {
    loadHistory();
  }, [project.id]);

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

  // Effect to restore state when project changes
  useEffect(() => {
    const projectState = getCurrentProjectState();
    setMessages(projectState.messages);
    setVariables(projectState.variables);
    setVariableInput(projectState.variableInput);
    setModelParams(projectState.modelParams);
    setResponse(projectState.response);
    setThoughtProcess(projectState.thoughtProcess);
    setHistoryViewMode(projectState.historyViewMode);
    setFooterInput(projectState.footerInput);
  }, [project.id]);

  // Effects to save state when it changes
  useEffect(() => {
    updateCurrentProjectState({ messages });
  }, [messages]);

  useEffect(() => {
    updateCurrentProjectState({ variables });
  }, [variables]);

  useEffect(() => {
    updateCurrentProjectState({ variableInput });
  }, [variableInput]);

  useEffect(() => {
    updateCurrentProjectState({ modelParams });
  }, [modelParams]);

  useEffect(() => {
    updateCurrentProjectState({ response });
  }, [response]);

  useEffect(() => {
    updateCurrentProjectState({ thoughtProcess });
  }, [thoughtProcess]);

  useEffect(() => {
    updateCurrentProjectState({ historyViewMode });
  }, [historyViewMode]);

  useEffect(() => {
    updateCurrentProjectState({ footerInput });
  }, [footerInput]);

  const loadHistory = async () => {
    try {
      const historyData = await api.getPromptHistory(project.id);
      setHistory(historyData);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

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

  const formatVariablesForDisplay = (vars: Record<string, string>): string => {
    return Object.entries(vars)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
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

  // Message management functions
  const addMessage = () => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'User',
      content: ''
    };
    setMessages([...messages, newMessage]);
  };

  const updateMessage = (id: string, field: keyof Message, value: string) => {
    setMessages(messages.map(msg => 
      msg.id === id ? { ...msg, [field]: value } : msg
    ));
  };

  const removeMessage = (id: string) => {
    if (messages.length > 1) {
      setMessages(messages.filter(msg => msg.id !== id));
    }
  };

  // Handle Ctrl+Enter in footer input
  const handleFooterKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey && event.key === 'Enter') {
      handleGenerate();
    }
  };

  // Handle role selector for messages
  const handleRoleSelect = (messageId: string, role: 'System' | 'User' | 'Assistant') => {
    updateMessage(messageId, 'role', role);
  };

  const handleEditProject = async (data: { name: string; llamastackUrl: string; providerId: string }) => {
    try {
      const updatedProject = await api.updateProject(currentProject.id, data);
      setCurrentProject(updatedProject);
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject);
      }
    } catch (err) {
      setError('Failed to update project');
      console.error('Project update error:', err);
    }
  };

  const handleDeleteProject = async () => {
    setIsDeleting(true);
    try {
      await api.deleteProject(currentProject.id);
      setIsDeleteModalOpen(false);
      if (onProjectDelete) {
        onProjectDelete();
      } else {
        onBack();
      }
    } catch (err) {
      setError('Failed to delete project');
      console.error('Project deletion error:', err);
      setIsDeleting(false);
    }
  };

  const handleGenerate = async () => {
    const userMessages = messages.filter(msg => msg.role === 'User' && msg.content.trim());
    const systemMessages = messages.filter(msg => msg.role === 'System' && msg.content.trim());
    
    if (userMessages.length === 0 && !footerInput.trim()) {
      setError('Please enter a user prompt');
      return;
    }

    setIsLoading(true);
    setError('');
    setResponse('');
    setThoughtProcess('');

    try {
      // Use footer input as user prompt if available, otherwise use the first user message
      const userPrompt = footerInput.trim() || userMessages[0]?.content || '';
      const systemPrompt = systemMessages.length > 0 ? systemMessages[0].content : undefined;
      
      await api.generateResponseStream(
        currentProject.id,
        {
          userPrompt,
          systemPrompt,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
          ...modelParams,
        },
        // onChunk - append each chunk to the response
        (chunk: string) => {
          // Simple parsing to separate thought process from response
          if (chunk.includes('<think>')) {
            const thoughtMatch = chunk.match(/<think>(.*?)<\/think>/s);
            if (thoughtMatch) {
              setThoughtProcess(prev => prev + thoughtMatch[1]);
              const responseText = chunk.replace(/<think>.*?<\/think>/s, '');
              setResponse(prev => prev + responseText);
            } else {
              setResponse(prev => prev + chunk);
            }
          } else {
            setResponse(prev => prev + chunk);
          }
        },
        // onError
        (error: string) => {
          setError(`Failed to generate response: ${error}`);
          setIsLoading(false);
        },
        // onComplete
        () => {
          setIsLoading(false);
          loadHistory(); // Reload history to show the new entry
          setFooterInput(''); // Clear footer input after generation
        }
      );
    } catch (err) {
      setError('Failed to generate response. Please check your Llama Stack configuration.');
      console.error('Generation error:', err);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      width: '100vw', 
      minHeight: '100vh', 
      margin: 0, 
      padding: 0,
      backgroundColor: '#f0f0f0',
      overflow: 'auto'
    }}>
      {/* Header Section */}
      <div style={{ 
        padding: '1rem',
        backgroundColor: 'white',
        borderBottom: '1px solid #d2d2d2'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <img 
            src="/grimoire-logo.png" 
            alt="Grimoire Logo" 
            style={{ width: '32px', height: '32px', marginRight: '12px' }}
          />
          <Title headingLevel="h1" size="2xl">{currentProject.name}</Title>
        </div>
        <small>
          Model: {currentProject.provider_id} | URL: {currentProject.llamastack_url}
        </small>
      </div>

      {/* Main Content Section - Langfuse-inspired Design */}
      <div style={{ 
        width: '100%',
        minHeight: 'calc(100vh - 120px)',
        padding: '0.5rem',
        boxSizing: 'border-box',
        backgroundColor: '#f5f5f5',
        color: '#333333'
      }}>
        {/* Project Management Controls */}
        <div style={{ 
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          gap: 'var(--pf-global--spacer--sm)'
        }}>
          <Button variant="secondary" size="sm" onClick={() => setIsEditModalOpen(true)}>
            Edit Project
          </Button>
          <Button variant="danger" size="sm" onClick={() => setIsDeleteModalOpen(true)}>
            Delete
          </Button>
          <Button variant="tertiary" size="sm" onClick={() => setIsApiDocModalOpen(true)}>
            API Docs
          </Button>
          <Button variant="link" size="sm" onClick={onBack}>
            ← Back to Projects
          </Button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 180px)' }}>
          {/* Playground Panel (~70%) */}
          <div style={{ 
            flex: '1',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            border: '1px solid #d0d0d0',
            borderRadius: '8px',
            padding: '1.5rem',
            minHeight: '0'
          }}>
            {/* Message Thread */}
            <div style={{ flex: 1, marginBottom: '1rem', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <Stack hasGutter>
                  {messages.map((message) => (
                    <StackItem key={message.id}>
                      <div style={{ 
                        display: 'flex', 
                        gap: '0.75rem',
                        padding: '1rem',
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px',
                        alignItems: 'flex-start'
                      }}>
                        <div style={{ width: '120px', flexShrink: 0 }}>
                          <FormSelect
                            value={message.role}
                            onChange={(_event, value) => {
                              handleRoleSelect(message.id, value as 'System' | 'User' | 'Assistant');
                            }}
                            aria-label="Select role"
                            style={{ width: '100%' }}
                          >
                            <FormSelectOption value="System" label="System" />
                            <FormSelectOption value="User" label="User" />
                            <FormSelectOption value="Assistant" label="Assistant" />
                          </FormSelect>
                        </div>
                        <div style={{ flex: 1 }}>
                          <TextArea
                            value={message.content}
                            onChange={(_event, value) => updateMessage(message.id, 'content', value)}
                            rows={3}
                            style={{ 
                              fontFamily: 'monospace',
                              backgroundColor: '#ffffff',
                              color: '#333333',
                              border: '1px solid #c0c0c0',
                              borderRadius: '4px'
                            }}
                            placeholder="Enter your message here..."
                          />
                        </div>
                        {messages.length > 1 && (
                          <Button
                            variant="plain"
                            onClick={() => removeMessage(message.id)}
                            style={{ color: '#666', minWidth: 'auto', padding: '0.25rem' }}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </StackItem>
                  ))}
                </Stack>
              </div>
              
              {/* Add Message Button - now positioned right below messages */}
              <div style={{ marginTop: '0.5rem', flexShrink: 0 }}>
                <Button
                  variant="link"
                  icon={<PlusIcon />}
                  onClick={addMessage}
                  style={{ color: '#0066cc', fontSize: '0.9rem' }}
                >
                  Add message
                </Button>
              </div>
            </div>

            {/* Output Section */}
            <div style={{ 
              height: '300px',
              marginBottom: '1rem',
              border: '1px solid #d0d0d0',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              <div style={{ 
                padding: '1rem',
                borderBottom: '1px solid #d0d0d0',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px 6px 0 0'
              }}>
                <Title headingLevel="h4" size="md" style={{ margin: 0, color: '#333333' }}>
                  Output
                </Title>
              </div>
              <div style={{
                height: 'calc(100% - 60px)',
                padding: '1rem',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                color: '#333333'
              }}>
                {isLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Spinner size="sm" />
                    <span>Generating...</span>
                  </div>
                ) : response ? (
                  <>
                    {response}
                    <div style={{ marginTop: '1rem' }}>
                      <ClipboardCopy isReadOnly variant="expansion">
                        {response}
                      </ClipboardCopy>
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#666', fontStyle: 'italic' }}>
                    Model output will appear here...
                  </div>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <div style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1rem'
            }}>
              <Button
                variant="primary"
                onClick={handleGenerate}
                isDisabled={isLoading}
              >
                {isLoading ? <Spinner size="sm" /> : 'Generate Response'}
              </Button>
              {error && (
                <Alert variant="danger" title="Error" style={{ marginLeft: '1rem', flex: 1 }}>
                  {error}
                </Alert>
              )}
            </div>
          </div>

          {/* Settings Panel (~30%) */}
          <GridItem span={4}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 200px)',
              backgroundColor: '#ffffff',
              padding: '1.5rem',
              borderRadius: '8px',
              border: '1px solid #d0d0d0',
              overflow: 'auto'
            }}>
              {/* Parameters Section */}
              <div style={{ marginBottom: 'var(--pf-global--spacer--lg)' }}>
                <Title headingLevel="h3" size="md" style={{ marginBottom: 'var(--pf-global--spacer--md)', color: '#333333' }}>
                  Parameters
                </Title>
                <Stack hasGutter>
                  <StackItem>
                    <FormGroup label="Temperature" fieldId="temperature">
                      <Tooltip content="Controls randomness. Higher = more creative.">
                        <NumberInput
                          value={modelParams.temperature}
                          onMinus={() => setModelParams(prev => ({ ...prev, temperature: Math.max(0, prev.temperature - 0.1) }))}
                          onPlus={() => setModelParams(prev => ({ ...prev, temperature: Math.min(2, prev.temperature + 0.1) }))}
                          min={0}
                          max={2}
                          step={0.1}
                          onChange={(event) => {
                            const value = parseFloat((event.target as HTMLInputElement).value) || 0;
                            setModelParams(prev => ({ ...prev, temperature: value }));
                          }}
                        />
                      </Tooltip>
                    </FormGroup>
                  </StackItem>
                  <StackItem>
                    <FormGroup label="Max Length" fieldId="max-length">
                      <Tooltip content="Maximum number of tokens in output.">
                        <NumberInput
                          value={modelParams.max_len}
                          onMinus={() => setModelParams(prev => ({ ...prev, max_len: Math.max(1, prev.max_len - 50) }))}
                          onPlus={() => setModelParams(prev => ({ ...prev, max_len: Math.min(4096, prev.max_len + 50) }))}
                          min={1}
                          max={4096}
                          onChange={(event) => {
                            const value = parseInt((event.target as HTMLInputElement).value) || 1;
                            setModelParams(prev => ({ ...prev, max_len: value }));
                          }}
                        />
                      </Tooltip>
                    </FormGroup>
                  </StackItem>
                  <StackItem>
                    <FormGroup label="Top-k" fieldId="top-k">
                      <Tooltip content="Sample from top-k most likely tokens.">
                        <NumberInput
                          value={modelParams.top_k}
                          onMinus={() => setModelParams(prev => ({ ...prev, top_k: Math.max(0, prev.top_k - 5) }))}
                          onPlus={() => setModelParams(prev => ({ ...prev, top_k: Math.min(100, prev.top_k + 5) }))}
                          min={0}
                          max={100}
                          onChange={(event) => {
                            const value = parseInt((event.target as HTMLInputElement).value) || 0;
                            setModelParams(prev => ({ ...prev, top_k: value }));
                          }}
                        />
                      </Tooltip>
                    </FormGroup>
                  </StackItem>
                  <StackItem>
                    <FormGroup label="Top-p" fieldId="top-p">
                      <Tooltip content="Sample from top tokens whose cumulative prob ≥ p.">
                        <NumberInput
                          value={modelParams.top_p}
                          onMinus={() => setModelParams(prev => ({ ...prev, top_p: Math.max(0, prev.top_p - 0.01) }))}
                          onPlus={() => setModelParams(prev => ({ ...prev, top_p: Math.min(1, prev.top_p + 0.01) }))}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(event) => {
                            const value = parseFloat((event.target as HTMLInputElement).value) || 0;
                            setModelParams(prev => ({ ...prev, top_p: value }));
                          }}
                        />
                      </Tooltip>
                    </FormGroup>
                  </StackItem>
                </Stack>
              </div>

              {/* Variables Section */}
              <div style={{ marginBottom: 'var(--pf-global--spacer--lg)' }}>
                <Title headingLevel="h3" size="md" style={{ marginBottom: 'var(--pf-global--spacer--md)', color: '#333333' }}>
                  Variables
                </Title>
                {Object.keys(variables).length > 0 ? (
                  <div>
                    <TextArea
                      value={variableInput}
                      onChange={(_event, value) => handleVariableInputChange(value)}
                      rows={4}
                      placeholder="name: John Doe&#10;age: 30&#10;city: New York"
                      style={{
                        fontFamily: 'monospace',
                        backgroundColor: '#f8f9fa',
                        color: '#333333',
                        border: '1px solid #d0d0d0'
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <div style={{ color: '#666', fontStyle: 'italic' }}>
                      No variables defined.
                    </div>
                    <br />
                    <div style={{ color: '#666', fontSize: 'var(--pf-global--FontSize--sm)' }}>
                      Use handlebars in your prompt to add a variable (&#123;&#123;exampleVariable&#125;&#125;).
                    </div>
                    <TextArea
                      value={variableInput}
                      onChange={(_event, value) => handleVariableInputChange(value)}
                      rows={3}
                      placeholder="name: John Doe&#10;age: 30&#10;city: New York"
                      style={{
                        fontFamily: 'monospace',
                        backgroundColor: '#f8f9fa',
                        color: '#333333',
                        border: '1px solid #d0d0d0',
                        marginTop: 'var(--pf-global--spacer--sm)'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* History Log Section */}
              <div style={{ flex: 1 }}>
                <Title headingLevel="h3" size="md" style={{ marginBottom: 'var(--pf-global--spacer--md)', color: '#333333' }}>
                  History
                </Title>
                <div style={{ 
                  maxHeight: '300px',
                  overflow: 'auto',
                  backgroundColor: '#f8f9fa',
                  borderRadius: 'var(--pf-global--BorderRadius--sm)',
                  padding: 'var(--pf-global--spacer--sm)',
                  border: '1px solid #d0d0d0'
                }}>
                  {history.length === 0 ? (
                    <EmptyState>
                      <EmptyStateBody>
                        <div style={{ textAlign: 'center', color: '#666' }}>
                          <ClockIcon size="lg" style={{ marginBottom: 'var(--pf-global--spacer--sm)' }} />
                          <div>No past runs yet.</div>
                        </div>
                      </EmptyStateBody>
                    </EmptyState>
                  ) : (
                    <Stack hasGutter>
                      {history.slice(0, 10).map((item, index) => (
                        <StackItem key={item.id}>
                          <Card variant="compact" style={{ 
                            backgroundColor: '#ffffff',
                            border: '1px solid #d0d0d0',
                            cursor: 'pointer'
                          }}>
                            <CardBody style={{ padding: 'var(--pf-global--spacer--sm)' }}>
                              <div style={{ fontSize: 'var(--pf-global--FontSize--xs)', color: '#666', marginBottom: 'var(--pf-global--spacer--xs)' }}>
                                🕒 {new Date(item.created_at).toLocaleString()}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: 'var(--pf-global--FontSize--sm)', marginBottom: 'var(--pf-global--spacer--xs)' }}>
                                <div>System: "{item.system_prompt ? item.system_prompt.substring(0, 60) + '...' : 'None'}"</div>
                                <div>User: "{item.user_prompt.substring(0, 60) + '...'}"</div>
                                <div>Output: "{item.response ? item.response.substring(0, 60) + '...' : 'None'}"</div>
                              </div>
                              <div style={{ fontSize: 'var(--pf-global--FontSize--xs)', color: '#666' }}>
                                Params: T={item.temperature || 'N/A'} | Len={item.max_len || 'N/A'} | Top-k={item.top_k || 'N/A'} | Top-p={item.top_p || 'N/A'}
                              </div>
                            </CardBody>
                          </Card>
                        </StackItem>
                      ))}
                    </Stack>
                  )}
                </div>
              </div>
            </div>
          </GridItem>
        </div>
      </div>

      <ProjectEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleEditProject}
        project={currentProject}
      />

      <DeleteProjectModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteProject}
        project={currentProject}
        isDeleting={isDeleting}
      />

      <ApiDocumentationModal
        isOpen={isApiDocModalOpen}
        onClose={() => setIsApiDocModalOpen(false)}
      />
    </div>
  );
};