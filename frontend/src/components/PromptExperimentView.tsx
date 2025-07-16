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
} from '@patternfly/react-core';
import { Project, PromptHistory, ModelParameters, GitUser } from '../types';
import { api } from '../api';
import { HistoryLog } from './HistoryLog';
import { ProjectEditModal } from './ProjectEditModal';
import { DeleteProjectModal } from './DeleteProjectModal';
import { ApiDocumentationModal } from './ApiDocumentationModal';
import { BackendTesting } from './BackendTesting';

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

// Project state cache interface
interface ProjectState {
  userPrompt: string;
  systemPrompt: string;
  variables: Record<string, string>;
  variableInput: string;
  modelParams: ModelParameters;
  response: string;
  historyViewMode: 'development' | 'backend' | 'prod';
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
    userPrompt: '',
    systemPrompt: '',
    variables: {},
    variableInput: '',
    modelParams: {
      temperature: 0.7,
      max_len: 1000,
      top_p: 0.9,
      top_k: 50,
    },
    response: '',
    historyViewMode: 'development',
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
  
  const [userPrompt, setUserPrompt] = useState(initialState.userPrompt);
  const [systemPrompt, setSystemPrompt] = useState(initialState.systemPrompt);
  const [variables, setVariables] = useState<Record<string, string>>(initialState.variables);
  const [variableInput, setVariableInput] = useState(initialState.variableInput);
  const [modelParams, setModelParams] = useState<ModelParameters>(initialState.modelParams);
  const [response, setResponse] = useState(initialState.response);
  const [historyViewMode, setHistoryViewMode] = useState<'development' | 'backend' | 'prod'>(initialState.historyViewMode);
  
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
    setUserPrompt(projectState.userPrompt);
    setSystemPrompt(projectState.systemPrompt);
    setVariables(projectState.variables);
    setVariableInput(projectState.variableInput);
    setModelParams(projectState.modelParams);
    setResponse(projectState.response);
    setHistoryViewMode(projectState.historyViewMode);
  }, [project.id]);

  // Effects to save state when it changes
  useEffect(() => {
    updateCurrentProjectState({ userPrompt });
  }, [userPrompt]);

  useEffect(() => {
    updateCurrentProjectState({ systemPrompt });
  }, [systemPrompt]);

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
    updateCurrentProjectState({ historyViewMode });
  }, [historyViewMode]);

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
    if (!userPrompt.trim()) {
      setError('Please enter a user prompt');
      return;
    }

    setIsLoading(true);
    setError('');
    setResponse('');

    try {
      await api.generateResponseStream(
        currentProject.id,
        {
          userPrompt,
          systemPrompt: systemPrompt || undefined,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
          ...modelParams,
        },
        // onChunk - append each chunk to the response
        (chunk: string) => {
          setResponse(prev => prev + chunk);
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
        <Title headingLevel="h1" size="2xl">{currentProject.name}</Title>
        <small>
          Model: {currentProject.provider_id} | URL: {currentProject.llamastack_url}
        </small>
      </div>

      {/* Main Content Section */}
      <div style={{ 
        width: '100%',
        minHeight: 'calc(100vh - 120px)',
        padding: '0.5rem',
        boxSizing: 'border-box'
      }}>
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          width: '100%',
          minHeight: 'calc(100vh - 200px)',
          flexWrap: 'nowrap',
          margin: 0,
          padding: 0
        }}>
          {/* Projects Sidebar */}
          <div style={{ 
            flex: '0 0 280px',
            minWidth: '280px',
            maxWidth: '300px'
          }}>
            <Card>
              <CardTitle>
                <Split hasGutter>
                  <SplitItem isFilled>Projects</SplitItem>
                  <SplitItem>
                    <Button 
                      variant="link" 
                      onClick={onCreateNew}
                      style={{ padding: 0, fontSize: '0.875rem' }}
                    >
                      + New
                    </Button>
                  </SplitItem>
                </Split>
              </CardTitle>
              <CardBody>
                {allProjects.length > 0 ? (
                  <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                    {allProjects.map((proj) => (
                      <div
                        key={proj.id}
                        style={{
                          padding: '0.5rem',
                          margin: '0.25rem 0',
                          borderRadius: '4px',
                          backgroundColor: proj.id === currentProject.id ? 'var(--pf-global--palette--blue-50)' : 'transparent',
                          border: proj.id === currentProject.id ? '2px solid var(--pf-global--palette--blue-300)' : '1px solid var(--pf-global--BorderColor--100)',
                          boxShadow: proj.id === currentProject.id ? '0 1px 4px rgba(0, 0, 0, 0.1)' : 'none',
                          transition: 'all 0.2s ease-in-out',
                        }}
                      >
                        <div 
                          style={{ cursor: 'pointer' }}
                          onClick={() => onProjectSelect?.(proj)}
                        >
                          <div style={{ 
                            fontWeight: proj.id === currentProject.id ? 'bold' : 'normal',
                            fontSize: '0.875rem',
                            marginBottom: '0.125rem'
                          }}>
                            {proj.name}
                          </div>
                          <small style={{ 
                            color: 'var(--pf-global--Color--200)',
                            fontSize: '0.75rem'
                          }}>
                            {proj.provider_id}
                          </small>
                        </div>
                        
                        {/* Show action buttons only for the current project */}
                        {proj.id === currentProject.id && (
                          <div style={{ 
                            marginTop: '0.5rem',
                            display: 'flex',
                            gap: '0.25rem',
                            flexWrap: 'wrap'
                          }}>
                            <Button 
                              variant="secondary" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsEditModalOpen(true);
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Edit
                            </Button>
                            <Button 
                              variant="danger" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsDeleteModalOpen(true);
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Delete
                            </Button>
                            <Button 
                              variant="tertiary" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsApiDocModalOpen(true);
                              }}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              API
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--pf-global--Color--200)', textAlign: 'center' }}>
                    No other projects
                  </p>
                )}
                
                {/* API Access Info */}
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.5rem', 
                  backgroundColor: 'var(--pf-global--palette--blue-50)', 
                  border: '1px solid var(--pf-global--palette--blue-200)', 
                  borderRadius: '4px' 
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    🔗 API Access
                  </div>
                  <Button 
                    variant="link" 
                    onClick={() => setIsApiDocModalOpen(true)}
                    style={{ padding: 0, fontSize: '0.7rem', height: 'auto' }}
                  >
                    View Documentation
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
          
          {/* Main Content Area */}
          <div style={{ 
            flex: '1',
            minWidth: '0'
          }}>
            <Card>
              <CardBody>
                <Tabs activeKey={activeTab} onSelect={(_event, tabIndex) => setActiveTab(tabIndex as string)}>
                  <Tab eventKey="experiment" title={<TabTitleText>Experiment</TabTitleText>}>
                    <div style={{ padding: '1rem 0' }}>
                      <Grid hasGutter>
                        <GridItem span={6}>
                          <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>Prompt Configuration</Title>
                          <Form>
                            <FormGroup label="User Prompt" isRequired fieldId="user-prompt">
                              <TextArea
                                isRequired
                                id="user-prompt"
                                name="user-prompt"
                                value={userPrompt}
                                onChange={(_event, value) => setUserPrompt(value)}
                                rows={4}
                                placeholder="Enter your prompt here. Use {{variable_name}} for template variables."
                              />
                            </FormGroup>

                            <FormGroup label="System Prompt" fieldId="system-prompt">
                              <TextArea
                                id="system-prompt"
                                name="system-prompt"
                                value={systemPrompt}
                                onChange={(_event, value) => setSystemPrompt(value)}
                                rows={3}
                                placeholder="Optional system prompt. Use {{variable_name}} for template variables."
                              />
                            </FormGroup>

                            <FormGroup 
                              label="Variables" 
                              fieldId="variables"
                            >
                              <div style={{ fontSize: '0.875rem', color: '#6a6e73', marginBottom: '0.5rem' }}>
                                Enter variables as key: value pairs, one per line. Use {'{'}key{'}'} in prompts to reference variables.
                              </div>
                              <TextArea
                                id="variables"
                                name="variables"
                                value={variableInput}
                                onChange={(_event, value) => handleVariableInputChange(value)}
                                rows={3}
                                placeholder="name: John Doe&#10;age: 30&#10;city: New York"
                              />
                            </FormGroup>

                            <Grid hasGutter style={{ marginBottom: '1rem' }}>
                              <GridItem span={6}>
                                <FormGroup label="Temperature" fieldId="temperature">
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
                                <FormGroup label="Max Length" fieldId="max-len">
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
                                <FormGroup label="Top P" fieldId="top-p">
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
                                <FormGroup label="Top K" fieldId="top-k">
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

                            {/* Preview section */}
                            {userPrompt && Object.keys(variables).length > 0 && (
                              <Card style={{ marginBottom: '1rem', backgroundColor: 'var(--pf-global--palette--blue-50)', maxHeight: '300px' }}>
                                <CardTitle>Preview (with variables)</CardTitle>
                                <CardBody style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                  <strong>User Prompt:</strong>
                                  <div style={{ 
                                    backgroundColor: 'white', 
                                    padding: '0.5rem', 
                                    border: '1px solid var(--pf-global--BorderColor--100)',
                                    borderRadius: '4px',
                                    marginTop: '0.25rem',
                                    marginBottom: '0.5rem',
                                    maxHeight: '100px',
                                    overflowY: 'auto'
                                  }}>
                                    {processTemplateVariables(userPrompt, variables)}
                                  </div>
                                  {systemPrompt && (
                                    <>
                                      <strong>System Prompt:</strong>
                                      <div style={{ 
                                        backgroundColor: 'white', 
                                        padding: '0.5rem', 
                                        border: '1px solid var(--pf-global--BorderColor--100)',
                                        borderRadius: '4px',
                                        marginTop: '0.25rem',
                                        maxHeight: '100px',
                                        overflowY: 'auto'
                                      }}>
                                        {processTemplateVariables(systemPrompt, variables)}
                                      </div>
                                    </>
                                  )}
                                </CardBody>
                              </Card>
                            )}

                            <Button 
                              variant="primary" 
                              onClick={handleGenerate}
                              isDisabled={isLoading || !userPrompt.trim()}
                            >
                              {isLoading ? <Spinner size="sm" /> : 'Generate Response'}
                            </Button>

                            {error && (
                              <Alert variant="danger" title="Error" style={{ marginTop: '1rem' }}>
                                {error}
                              </Alert>
                            )}
                          </Form>
                        </GridItem>
                        
                        <GridItem span={6}>
                          <Title headingLevel="h3" size="lg" style={{ marginBottom: '1rem' }}>Response</Title>
                          {response || isLoading ? (
                            <Card style={{ height: 'calc(100vh - 400px)', minHeight: '400px' }}>
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
                            <Card style={{ height: 'calc(100vh - 400px)', minHeight: '400px' }}>
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
                  <Tab eventKey="backend-testing" title={<TabTitleText>Backend Testing</TabTitleText>}>
                    <div style={{ padding: '1rem 0' }}>
                      <BackendTesting project={project} />
                    </div>
                  </Tab>
                </Tabs>
              </CardBody>
            </Card>
          </div>
          
          {/* History Log Section */}
          <div style={{ 
            flex: '0 0 350px',
            minWidth: '350px',
            maxWidth: '400px',
            height: '100%',
            overflow: 'hidden'
          }}>
            <HistoryLog 
              history={history} 
              onHistoryUpdate={loadHistory} 
              projectId={project.id}
              hasGitRepo={!!project.git_repo_url}
              gitUser={gitUser}
              onGitAuth={onGitAuth}
              onNotification={onNotification}
              viewMode={historyViewMode}
              onViewModeChange={setHistoryViewMode}
            />
          </div>
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