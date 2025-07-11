import React, { useState, useEffect } from 'react';
import {
  Page,
  PageSection,
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
} from '@patternfly/react-core';
import { Project, PromptHistory, ModelParameters } from '../types';
import { api } from '../api';
import { HistoryLog } from './HistoryLog';
import { ProjectEditModal } from './ProjectEditModal';
import { DeleteProjectModal } from './DeleteProjectModal';

interface PromptExperimentViewProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate?: (updatedProject: Project) => void;
  onProjectDelete?: () => void;
  onProjectSelect?: (project: Project) => void;
  allProjects?: Project[];
  onCreateNew?: () => void;
}

export const PromptExperimentView: React.FC<PromptExperimentViewProps> = ({
  project,
  onBack,
  onProjectUpdate,
  onProjectDelete,
  onProjectSelect,
  allProjects = [],
  onCreateNew,
}) => {
  const [userPrompt, setUserPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [variableInput, setVariableInput] = useState('');
  const [modelParams, setModelParams] = useState<ModelParameters>({
    temperature: 0.7,
    max_len: 1000,
    top_p: 0.9,
    top_k: 50,
  });
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<PromptHistory[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project>(project);

  useEffect(() => {
    loadHistory();
  }, [project.id]);

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

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
      setError('Failed to generate response. Please check your Llamastack configuration.');
      console.error('Generation error:', err);
      setIsLoading(false);
    }
  };

  return (
    <Page>
      <PageSection>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h1" size="2xl">{currentProject.name}</Title>
            <small>
              Model: {currentProject.provider_id} | URL: {currentProject.llamastack_url}
            </small>
          </SplitItem>
          <SplitItem>
            <Button variant="secondary" onClick={() => setIsEditModalOpen(true)}>
              Edit Project
            </Button>
          </SplitItem>
          <SplitItem>
            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)}>
              Delete Project
            </Button>
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection>
        <Grid hasGutter>
          <GridItem span={3}>
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
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {allProjects.map((proj) => (
                      <div
                        key={proj.id}
                        style={{
                          padding: '0.75rem',
                          margin: '0.5rem 0',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: proj.id === currentProject.id ? 'var(--pf-global--palette--blue-50)' : 'var(--pf-global--BackgroundColor--100)',
                          border: proj.id === currentProject.id ? '2px solid var(--pf-global--palette--blue-300)' : '1px solid var(--pf-global--BorderColor--100)',
                          boxShadow: proj.id === currentProject.id ? '0 2px 8px rgba(0, 0, 0, 0.1)' : 'none',
                          transform: proj.id === currentProject.id ? 'translateY(-1px)' : 'none',
                          transition: 'all 0.2s ease-in-out',
                        }}
                        onClick={() => onProjectSelect?.(proj)}
                      >
                        <div style={{ fontWeight: proj.id === currentProject.id ? 'bold' : 'normal' }}>
                          {proj.name}
                        </div>
                        <small style={{ color: 'var(--pf-global--Color--200)' }}>
                          {proj.provider_id}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--pf-global--Color--200)', textAlign: 'center' }}>
                    No other projects
                  </p>
                )}
              </CardBody>
            </Card>
          </GridItem>
          <GridItem span={5}>
            <Card>
              <CardTitle>Prompt Configuration</CardTitle>
              <CardBody>
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
                    helperText="Enter variables as key: value pairs, one per line. Use {{key}} in prompts to reference variables."
                  >
                    <TextArea
                      id="variables"
                      name="variables"
                      value={variableInput}
                      onChange={(_event, value) => handleVariableInputChange(value)}
                      rows={3}
                      placeholder="name: John Doe&#10;age: 30&#10;city: New York"
                    />
                  </FormGroup>

                  <Grid hasGutter>
                    <GridItem span={3}>
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
                    <GridItem span={3}>
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
                    <GridItem span={3}>
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
                    <GridItem span={3}>
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
                    <Card style={{ marginBottom: '1rem', backgroundColor: 'var(--pf-global--palette--blue-50)' }}>
                      <CardTitle>Preview (with variables)</CardTitle>
                      <CardBody>
                        <strong>User Prompt:</strong>
                        <div style={{ 
                          backgroundColor: 'white', 
                          padding: '0.5rem', 
                          border: '1px solid var(--pf-global--BorderColor--100)',
                          borderRadius: '4px',
                          marginTop: '0.25rem',
                          marginBottom: '0.5rem'
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
                              marginTop: '0.25rem'
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
                </Form>

                {error && (
                  <Alert variant="danger" title="Error" style={{ marginTop: '1rem' }}>
                    {error}
                  </Alert>
                )}

                {response && (
                  <Card style={{ marginTop: '1rem' }}>
                    <CardTitle>Response</CardTitle>
                    <CardBody>
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                        {response}
                      </pre>
                    </CardBody>
                  </Card>
                )}
              </CardBody>
            </Card>
          </GridItem>

          <GridItem span={4}>
            <HistoryLog history={history} onHistoryUpdate={loadHistory} />
          </GridItem>
        </Grid>
      </PageSection>

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
    </Page>
  );
};