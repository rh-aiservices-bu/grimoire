import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardBody,
  Form,
  FormGroup,
  TextInput,
  TextArea,
  Button,
  Spinner,
  Alert,
  Title,
  NumberInput,
  Stack,
  StackItem,
  FormSelect,
  FormSelectOption,
  Tooltip,
  EmptyState,
  EmptyStateBody,
  ClipboardCopy,
  Modal,
  ModalVariant,
  CodeBlock,
  CodeBlockCode,
  Tabs,
  Tab,
  TabTitleText,
} from '@patternfly/react-core';
import { PlusIcon, ClockIcon, CopyIcon, EyeIcon } from '@patternfly/react-icons';
import { Project, PromptHistory, ModelParameters } from '../../types';
import { api } from '../../api';

// Message interface for the playground design
interface Message {
  id: string;
  role: 'System' | 'User' | 'Assistant';
  content: string;
}

interface PlaygroundPageProps {
  project: Project;
  onNotification?: (notification: {
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }) => void;
}

// Playground state interface
interface PlaygroundState {
  messages: Message[];
  variables: Record<string, string>;
  variableInput: string;
  modelParams: ModelParameters;
  response: string;
  thoughtProcess: string;
  footerInput: string;
}

export const PlaygroundPage: React.FC<PlaygroundPageProps> = ({
  project,
  onNotification,
}) => {
  // Default state for the playground
  const getDefaultPlaygroundState = (): PlaygroundState => ({
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
    footerInput: '',
  });

  // State management
  const [state, setState] = useState<PlaygroundState>(getDefaultPlaygroundState());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<PromptHistory[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestPayload, setRequestPayload] = useState<any>(null);
  const [requestModalTab, setRequestModalTab] = useState<string | number>('json');

  // Convenience getters for state properties
  const { messages, variables, variableInput, modelParams, response, thoughtProcess, footerInput } = state;

  // Convenience setter for updating state
  const updateState = (updates: Partial<PlaygroundState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  useEffect(() => {
    loadHistory();
  }, [project.id]);

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

  const handleVariableInputChange = (value: string) => {
    const parsedVars = parseVariables(value);
    updateState({ 
      variableInput: value,
      variables: parsedVars 
    });
  };

  // Message management functions
  const addMessage = () => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'User',
      content: ''
    };
    updateState({ messages: [...messages, newMessage] });
  };

  const updateMessage = (id: string, field: keyof Message, value: string) => {
    const updatedMessages = messages.map(msg => 
      msg.id === id ? { ...msg, [field]: value } : msg
    );
    updateState({ messages: updatedMessages });
  };

  const removeMessage = (id: string) => {
    if (messages.length > 1) {
      const filteredMessages = messages.filter(msg => msg.id !== id);
      updateState({ messages: filteredMessages });
    }
  };

  const handleRoleSelect = (messageId: string, role: 'System' | 'User' | 'Assistant') => {
    updateMessage(messageId, 'role', role);
  };

  const buildRequestPayload = () => {
    const userMessages = messages.filter(msg => msg.role === 'User' && msg.content.trim());
    const systemMessages = messages.filter(msg => msg.role === 'System' && msg.content.trim());
    
    const userPrompt = footerInput.trim() || userMessages[0]?.content || '';
    const systemPrompt = systemMessages.length > 0 ? systemMessages[0].content : undefined;
    
    return {
      userPrompt,
      systemPrompt,
      variables: Object.keys(variables).length > 0 ? variables : undefined,
      ...modelParams,
    };
  };

  const buildCurlCommand = (payload: any) => {
    // Assume we're running locally - could be made configurable
    const apiUrl = `${window.location.origin}/api/projects/${project.id}/generate`;
    
    return `curl -X POST "${apiUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
  };

  const handleSeeRequest = () => {
    const payload = buildRequestPayload();
    setRequestPayload(payload);
    setRequestModalTab('json'); // Reset to JSON tab
    setIsRequestModalOpen(true);
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
    updateState({ response: '', thoughtProcess: '' });

    try {
      const userPrompt = footerInput.trim() || userMessages[0]?.content || '';
      const systemPrompt = systemMessages.length > 0 ? systemMessages[0].content : undefined;
      
      await api.generateResponseStream(
        project.id,
        {
          userPrompt,
          systemPrompt,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
          ...modelParams,
        },
        // onChunk
        (chunk: string) => {
          if (chunk.includes('<think>')) {
            const thoughtMatch = chunk.match(/<think>(.*?)<\/think>/s);
            if (thoughtMatch) {
              setState(prev => ({
                ...prev,
                thoughtProcess: prev.thoughtProcess + thoughtMatch[1],
                response: prev.response + chunk.replace(/<think>.*?<\/think>/s, '')
              }));
            } else {
              setState(prev => ({ ...prev, response: prev.response + chunk }));
            }
          } else {
            setState(prev => ({ ...prev, response: prev.response + chunk }));
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
          loadHistory();
          updateState({ footerInput: '' });
        }
      );
    } catch (err) {
      setError('Failed to generate response. Please check your Llama Stack configuration.');
      console.error('Generation error:', err);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 140px)' }}>
      {/* Main Playground Panel (~70%) */}
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
            borderRadius: '6px 6px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Title headingLevel="h4" size="md" style={{ margin: 0, color: '#333333' }}>
              Output
            </Title>
            {response && (
              <Button
                variant="plain"
                icon={<CopyIcon />}
                onClick={() => {
                  navigator.clipboard.writeText(response);
                }}
                style={{ 
                  color: '#666', 
                  minWidth: 'auto',
                  padding: '0.25rem 0.5rem'
                }}
                aria-label="Copy output"
              >
                Copy
              </Button>
            )}
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
              response
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
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Button
              variant="primary"
              onClick={handleGenerate}
              isDisabled={isLoading}
            >
              {isLoading ? <Spinner size="sm" /> : 'Generate Response'}
            </Button>
            <Button
              variant="secondary"
              icon={<EyeIcon />}
              onClick={handleSeeRequest}
              style={{ 
                color: '#6a6e73',
                borderColor: '#d2d2d2',
                backgroundColor: 'transparent'
              }}
            >
              See Request
            </Button>
          </div>
          {error && (
            <Alert variant="danger" title="Error" style={{ marginLeft: '1rem', flex: 1 }}>
              {error}
            </Alert>
          )}
        </div>
      </div>

      {/* Settings Panel (~30%) */}
      <div style={{
        width: '350px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
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
                    onMinus={() => updateState({ 
                      modelParams: { ...modelParams, temperature: Math.max(0, modelParams.temperature - 0.1) }
                    })}
                    onPlus={() => updateState({ 
                      modelParams: { ...modelParams, temperature: Math.min(2, modelParams.temperature + 0.1) }
                    })}
                    min={0}
                    max={2}
                    step={0.1}
                    onChange={(event) => {
                      const value = parseFloat((event.target as HTMLInputElement).value) || 0;
                      updateState({ modelParams: { ...modelParams, temperature: value } });
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
                    onMinus={() => updateState({ 
                      modelParams: { ...modelParams, max_len: Math.max(1, modelParams.max_len - 50) }
                    })}
                    onPlus={() => updateState({ 
                      modelParams: { ...modelParams, max_len: Math.min(4096, modelParams.max_len + 50) }
                    })}
                    min={1}
                    max={4096}
                    onChange={(event) => {
                      const value = parseInt((event.target as HTMLInputElement).value) || 1;
                      updateState({ modelParams: { ...modelParams, max_len: value } });
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
                    onMinus={() => updateState({ 
                      modelParams: { ...modelParams, top_k: Math.max(0, modelParams.top_k - 5) }
                    })}
                    onPlus={() => updateState({ 
                      modelParams: { ...modelParams, top_k: Math.min(100, modelParams.top_k + 5) }
                    })}
                    min={0}
                    max={100}
                    onChange={(event) => {
                      const value = parseInt((event.target as HTMLInputElement).value) || 0;
                      updateState({ modelParams: { ...modelParams, top_k: value } });
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
                    onMinus={() => updateState({ 
                      modelParams: { ...modelParams, top_p: Math.max(0, modelParams.top_p - 0.01) }
                    })}
                    onPlus={() => updateState({ 
                      modelParams: { ...modelParams, top_p: Math.min(1, modelParams.top_p + 0.01) }
                    })}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(event) => {
                      const value = parseFloat((event.target as HTMLInputElement).value) || 0;
                      updateState({ modelParams: { ...modelParams, top_p: value } });
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
          <div>
            <div style={{ color: '#666', fontSize: 'var(--pf-global--FontSize--sm)', marginBottom: 'var(--pf-global--spacer--sm)' }}>
              Use handlebars in your prompt to add a variable (&#123;&#123;exampleVariable&#125;&#125;).
            </div>
            <TextArea
              value={variableInput}
              onChange={(_event, value) => handleVariableInputChange(value)}
              rows={Object.keys(variables).length > 0 ? 4 : 3}
              placeholder="name: John Doe&#10;age: 30&#10;city: New York"
              style={{
                fontFamily: 'monospace',
                backgroundColor: '#f8f9fa',
                color: '#333333',
                border: '1px solid #d0d0d0'
              }}
            />
          </div>
        </div>

        {/* History Log Section */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Title headingLevel="h3" size="md" style={{ marginTop: '32px', marginBottom: 'var(--pf-global--spacer--md)', color: '#333333' }}>
            History
          </Title>
          <div style={{ 
            flex: 1,
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
                      <CardBody style={{ padding: '16px' }}>
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

      {/* Request Payload Modal */}
      <Modal
        variant={ModalVariant.large}
        title="API Request Details"
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
      >
        <div style={{ padding: '1rem 1rem 1rem 1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ color: '#666', fontSize: '0.875rem', margin: 0 }}>
              This shows the exact request that will be sent to the API when you press "Generate Response":
            </p>
          </div>
          
          <Tabs 
            activeKey={requestModalTab} 
            onSelect={(event, tabIndex) => setRequestModalTab(tabIndex)}
            style={{ marginBottom: '1rem' }}
          >
            <Tab eventKey="json" title={<TabTitleText>JSON Payload</TabTitleText>}>
              {requestPayload && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                  <CodeBlock>
                    <CodeBlockCode>
                      {JSON.stringify(requestPayload, null, 2)}
                    </CodeBlockCode>
                  </CodeBlock>
                </div>
              )}
            </Tab>
            <Tab eventKey="curl" title={<TabTitleText>cURL Command</TabTitleText>}>
              {requestPayload && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                  <CodeBlock>
                    <CodeBlockCode>
                      {buildCurlCommand(requestPayload)}
                    </CodeBlockCode>
                  </CodeBlock>
                </div>
              )}
            </Tab>
          </Tabs>
        </div>
      </Modal>
    </div>
  );
};