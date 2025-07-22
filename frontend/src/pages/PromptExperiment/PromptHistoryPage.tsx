import React, { useState, useEffect } from 'react';
import {
  Card,
  CardBody,
  Title,
  Stack,
  StackItem,
  EmptyState,
  EmptyStateBody,
  Spinner,
  Badge,
  Button,
  ClipboardCopy,
} from '@patternfly/react-core';
import { 
  ClockIcon, 
  ThumbsUpIcon, 
  ThumbsDownIcon,
  StarIcon,
  CopyIcon 
} from '@patternfly/react-icons';
import { Project, PromptHistory } from '../../types';
import { api } from '../../api';

interface PromptHistoryPageProps {
  project: Project;
  onNotification?: (notification: {
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }) => void;
}

export const PromptHistoryPage: React.FC<PromptHistoryPageProps> = ({
  project,
  onNotification,
}) => {
  const [history, setHistory] = useState<PromptHistory[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [project.id]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const historyData = await api.getPromptHistory(project.id);
      setHistory(historyData);
      // Auto-select the first prompt if available
      if (historyData.length > 0) {
        setSelectedPrompt(historyData[0]);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      if (onNotification) {
        onNotification({
          title: 'Error',
          variant: 'danger',
          message: 'Failed to load prompt history'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptSelect = (prompt: PromptHistory) => {
    setSelectedPrompt(prompt);
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    if (onNotification) {
      onNotification({
        title: 'Copied',
        variant: 'success',
        message: `${type} copied to clipboard`
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getRatingIcon = (rating: boolean | null) => {
    if (rating === true) return <ThumbsUpIcon style={{ color: '#3e8635' }} />;
    if (rating === false) return <ThumbsDownIcon style={{ color: '#c9190b' }} />;
    return null;
  };

  const getRatingText = (rating: boolean | null) => {
    if (rating === true) return 'Positive';
    if (rating === false) return 'Negative';
    return 'No rating';
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 140px)' }}>
      {/* Left Panel - Prompt List */}
      <div style={{
        width: '400px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        border: '1px solid #d0d0d0',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #d0d0d0',
          backgroundColor: '#f8f9fa'
        }}>
          <Title headingLevel="h3" size="md" style={{ margin: 0 }}>
            Prompts History
          </Title>
          <div style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {history.length} {history.length === 1 ? 'prompt' : 'prompts'}
          </div>
        </div>

        {/* Prompt List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <Spinner size="md" />
            </div>
          ) : history.length === 0 ? (
            <EmptyState>
              <EmptyStateBody>
                <div style={{ textAlign: 'center', color: '#666' }}>
                  <ClockIcon size="lg" style={{ marginBottom: '1rem' }} />
                  <div>No prompts yet.</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Try the Playground to create your first prompt.
                  </div>
                </div>
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <Stack hasGutter>
              {history.map((item) => (
                <StackItem key={item.id}>
                  <Card 
                    variant="compact" 
                    style={{ 
                      backgroundColor: selectedPrompt?.id === item.id ? '#f0f8ff' : '#ffffff',
                      border: selectedPrompt?.id === item.id ? '2px solid #0066cc' : '1px solid #d0d0d0',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => handlePromptSelect(item)}
                    onMouseEnter={(e) => {
                      if (selectedPrompt?.id !== item.id) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedPrompt?.id !== item.id) {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }
                    }}
                  >
                    <CardBody style={{ padding: '1rem' }}>
                      {/* Header with timestamp and rating */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '0.5rem' 
                      }}>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>
                          {formatDate(item.created_at)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {item.is_prod && (
                            <Badge variant="outline" style={{ 
                              color: '#3e8635', 
                              borderColor: '#3e8635',
                              fontSize: '0.6rem'
                            }}>
                              <StarIcon style={{ fontSize: '0.6rem', marginRight: '0.25rem' }} />
                              PROD
                            </Badge>
                          )}
                          {getRatingIcon(item.rating)}
                        </div>
                      </div>

                      {/* User prompt preview */}
                      <div style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '0.875rem',
                        lineHeight: '1.4',
                        marginBottom: '0.5rem'
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                          User: 
                        </div>
                        <div style={{ color: '#333' }}>
                          {item.user_prompt.length > 80 
                            ? item.user_prompt.substring(0, 80) + '...'
                            : item.user_prompt
                          }
                        </div>
                      </div>

                      {/* Parameters */}
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#666',
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap'
                      }}>
                        <span>T={item.temperature || 'N/A'}</span>
                        <span>Len={item.max_len || 'N/A'}</span>
                        <span>Top-k={item.top_k || 'N/A'}</span>
                        <span>Top-p={item.top_p || 'N/A'}</span>
                      </div>
                    </CardBody>
                  </Card>
                </StackItem>
              ))}
            </Stack>
          )}
        </div>
      </div>

      {/* Right Panel - Prompt Details */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        border: '1px solid #d0d0d0',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        {selectedPrompt ? (
          <>
            {/* Header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid #d0d0d0',
              backgroundColor: '#f8f9fa'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Title headingLevel="h3" size="md" style={{ margin: 0 }}>
                    Prompt Details
                  </Title>
                  <div style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {formatDate(selectedPrompt.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {getRatingIcon(selectedPrompt.rating)}
                    <span style={{ fontSize: '0.875rem', color: '#666' }}>
                      {getRatingText(selectedPrompt.rating)}
                    </span>
                  </div>
                  {selectedPrompt.is_prod && (
                    <Badge style={{ 
                      backgroundColor: '#3e8635', 
                      color: '#ffffff'
                    }}>
                      <StarIcon style={{ fontSize: '0.7rem', marginRight: '0.25rem' }} />
                      Production
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
              <Stack hasGutter>
                {/* System Prompt */}
                {selectedPrompt.system_prompt && (
                  <StackItem>
                    <Card variant="compact">
                      <CardBody>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '0.5rem'
                        }}>
                          <Title headingLevel="h4" size="sm" style={{ margin: 0 }}>
                            System Prompt
                          </Title>
                          <Button
                            variant="plain"
                            icon={<CopyIcon />}
                            onClick={() => copyToClipboard(selectedPrompt.system_prompt!, 'System prompt')}
                            style={{ minWidth: 'auto', padding: '0.25rem' }}
                          >
                            Copy
                          </Button>
                        </div>
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          backgroundColor: '#f8f9fa',
                          padding: '0.75rem',
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.4'
                        }}>
                          {selectedPrompt.system_prompt}
                        </div>
                      </CardBody>
                    </Card>
                  </StackItem>
                )}

                {/* User Prompt */}
                <StackItem>
                  <Card variant="compact">
                    <CardBody>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '0.5rem'
                      }}>
                        <Title headingLevel="h4" size="sm" style={{ margin: 0 }}>
                          User Prompt
                        </Title>
                        <Button
                          variant="plain"
                          icon={<CopyIcon />}
                          onClick={() => copyToClipboard(selectedPrompt.user_prompt, 'User prompt')}
                          style={{ minWidth: 'auto', padding: '0.25rem' }}
                        >
                          Copy
                        </Button>
                      </div>
                      <div style={{
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        backgroundColor: '#f8f9fa',
                        padding: '0.75rem',
                        borderRadius: '4px',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.4'
                      }}>
                        {selectedPrompt.user_prompt}
                      </div>
                    </CardBody>
                  </Card>
                </StackItem>

                {/* Variables */}
                {selectedPrompt.variables && Object.keys(selectedPrompt.variables).length > 0 && (
                  <StackItem>
                    <Card variant="compact">
                      <CardBody>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '0.5rem'
                        }}>
                          <Title headingLevel="h4" size="sm" style={{ margin: 0 }}>
                            Variables
                          </Title>
                          <Button
                            variant="plain"
                            icon={<CopyIcon />}
                            onClick={() => copyToClipboard(JSON.stringify(selectedPrompt.variables, null, 2), 'Variables')}
                            style={{ minWidth: 'auto', padding: '0.25rem' }}
                          >
                            Copy
                          </Button>
                        </div>
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          backgroundColor: '#f8f9fa',
                          padding: '0.75rem',
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.4'
                        }}>
                          {JSON.stringify(selectedPrompt.variables, null, 2)}
                        </div>
                      </CardBody>
                    </Card>
                  </StackItem>
                )}

                {/* Response */}
                {selectedPrompt.response && (
                  <StackItem>
                    <Card variant="compact">
                      <CardBody>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '0.5rem'
                        }}>
                          <Title headingLevel="h4" size="sm" style={{ margin: 0 }}>
                            Response
                          </Title>
                          <Button
                            variant="plain"
                            icon={<CopyIcon />}
                            onClick={() => copyToClipboard(selectedPrompt.response!, 'Response')}
                            style={{ minWidth: 'auto', padding: '0.25rem' }}
                          >
                            Copy
                          </Button>
                        </div>
                        <div style={{
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          backgroundColor: '#f8f9fa',
                          padding: '0.75rem',
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.4',
                          maxHeight: '300px',
                          overflow: 'auto'
                        }}>
                          {selectedPrompt.response}
                        </div>
                      </CardBody>
                    </Card>
                  </StackItem>
                )}

                {/* Model Parameters */}
                <StackItem>
                  <Card variant="compact">
                    <CardBody>
                      <Title headingLevel="h4" size="sm" style={{ margin: 0, marginBottom: '0.75rem' }}>
                        Model Parameters
                      </Title>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '0.75rem',
                        fontSize: '0.875rem'
                      }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>Temperature: </span>
                          <span>{selectedPrompt.temperature || 'N/A'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Max Length: </span>
                          <span>{selectedPrompt.max_len || 'N/A'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Top-k: </span>
                          <span>{selectedPrompt.top_k || 'N/A'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Top-p: </span>
                          <span>{selectedPrompt.top_p || 'N/A'}</span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </StackItem>

                {/* Notes */}
                {selectedPrompt.notes && (
                  <StackItem>
                    <Card variant="compact">
                      <CardBody>
                        <Title headingLevel="h4" size="sm" style={{ margin: 0, marginBottom: '0.5rem' }}>
                          Notes
                        </Title>
                        <div style={{
                          fontSize: '0.875rem',
                          backgroundColor: '#f8f9fa',
                          padding: '0.75rem',
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.4'
                        }}>
                          {selectedPrompt.notes}
                        </div>
                      </CardBody>
                    </Card>
                  </StackItem>
                )}
              </Stack>
            </div>
          </>
        ) : (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            color: '#666'
          }}>
            <EmptyState>
              <EmptyStateBody>
                <ClockIcon size="lg" style={{ marginBottom: '1rem' }} />
                <Title headingLevel="h4" size="md">
                  Select a prompt
                </Title>
                <div style={{ marginTop: '0.5rem' }}>
                  Choose a prompt from the list to view its details.
                </div>
              </EmptyStateBody>
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
};