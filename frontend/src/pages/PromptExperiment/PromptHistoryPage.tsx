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
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@patternfly/react-core';
import { 
  ClockIcon, 
  ThumbsUpIcon, 
  ThumbsDownIcon,
  StarIcon,
  CopyIcon 
} from '@patternfly/react-icons';
import { Project, PromptHistory, PendingPR, PromotionStatus } from '../../types';
import { api } from '../../api';
import { GitAuthModal } from '../../components/modals';

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
  const [promotionStatus, setPromotionStatus] = useState<PromotionStatus>({
    pendingPRs: []
  });
  const [isPromoting, setIsPromoting] = useState(false);
  const [isGitAuthModalOpen, setIsGitAuthModalOpen] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [gitAuthStatus, setGitAuthStatus] = useState<{
    authenticated: boolean;
    user?: { username: string; platform: string; server_url?: string };
  }>({ authenticated: false });
  const [showTestConfirmModal, setShowTestConfirmModal] = useState(false);
  const [showProdConfirmModal, setShowProdConfirmModal] = useState(false);
  const [confirmationPrompt, setConfirmationPrompt] = useState<PromptHistory | null>(null);

  useEffect(() => {
    loadHistory();
    loadGitAuthStatus();
  }, [project.id]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      
      // Load prompt history - keep in natural chronological order as returned by backend
      // DO NOT sort here - prompts should remain in their natural order, not sorted by status
      const historyData = await api.getPromptHistory(project.id);
      setHistory(historyData);
      
      // Load promotion status
      await loadPromotionStatus(historyData);
      
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

  const loadPromotionStatus = async (historyData: PromptHistory[]) => {
    try {
      // IMPORTANT: Backend naming is confusing!
      // - is_prod = True in PromptHistory actually means "current test" (not production!)
      // Note: No longer need to filter negative IDs since duplicate cards were removed from backend
      const currentTest = historyData.find(p => p.is_prod); // is_prod actually means "current test"!
      
      // Use existing backend bulk sync functionality to ensure all Git data is current
      try {
        console.log('Syncing all Git projects using existing backend sync...');
        await api.syncAllGitProjects();
        console.log('Git sync completed');
      } catch (syncErr) {
        console.warn('Failed to sync all Git projects:', syncErr);
        // Still try individual sync methods as fallback
        try {
          await api.syncPRStatus(project.id);
        } catch (prSyncErr) {
          console.warn('Failed to sync PR status during load:', prSyncErr);
        }
      }
      
      // Load pending PRs (now synced with Git)
      const pendingPRs = await api.getPendingPRs(project.id);
      
      // Get production status from Git (this endpoint has automatic sync with rate limiting)
      let currentProd: PromptHistory | undefined;
      try {
        const prodHistory = await api.getProdHistoryFromGit(project.id);
        if (prodHistory && prodHistory.length > 0) {
          // Find the most recent production prompt from Git
          const latestProdGit = prodHistory[0]; // Backend returns sorted by date desc
          currentProd = historyData.find(p => 
            p.id === latestProdGit.prompt_history_id || 
            (p.user_prompt === latestProdGit.user_prompt && p.system_prompt === latestProdGit.system_prompt)
          );
        }
      } catch (gitErr) {
        console.warn('Failed to load production history from Git:', gitErr);
        // Fallback: determine from merged PRs
        const mergedPRs = pendingPRs.filter((pr: any) => pr.is_merged);
        if (mergedPRs.length > 0) {
          const latestMergedPR = mergedPRs[0];
          currentProd = historyData.find(p => p.id === latestMergedPR.prompt_history_id);
        }
      }
      
      setPromotionStatus({
        currentProd,
        currentTest,
        pendingPRs: pendingPRs.filter((pr: any) => !pr.is_merged) // Only show unmerged PRs as pending
      });
    } catch (err) {
      console.error('Failed to load promotion status:', err);
      // Don't show error notification for this, as it's supplementary
    }
  };

  const loadGitAuthStatus = async () => {
    try {
      const status = await api.getGitAuthStatus();
      setGitAuthStatus(status);
    } catch (err) {
      console.error('Failed to load git auth status:', err);
      setGitAuthStatus({ authenticated: false });
    }
  };

  const handlePromptSelect = (prompt: PromptHistory) => {
    setSelectedPrompt(prompt);
  };

  const handleGitAuth = async (authData: { platform: string; username: string; access_token: string; server_url?: string }) => {
    try {
      setIsAuthenticating(true);
      await api.authenticateGit(authData);
      
      if (onNotification) {
        onNotification({
          title: 'Success',
          variant: 'success',
          message: `Successfully authenticated with ${authData.platform}`
        });
      }
      
      setIsGitAuthModalOpen(false);
      // Reload git auth status after successful authentication
      await loadGitAuthStatus();
    } catch (err: any) {
      console.error('Git authentication failed:', err);
      let errorMessage = 'Failed to authenticate with Git provider';
      
      if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }
      
      if (onNotification) {
        onNotification({
          title: 'Authentication Failed',
          variant: 'danger',
          message: errorMessage
        });
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePromoteToTest = async (prompt: PromptHistory) => {
    try {
      setIsPromoting(true);
      const result = await api.tagPromptAsTest(project.id, prompt.id);

      if (onNotification) {
        onNotification({
          title: 'Success',
          variant: 'success',
          message: result.message || 'Prompt promoted to test and committed to Git',
          actionLinks: result.commit_url ? [{ text: 'View Commit', url: result.commit_url }] : []
        });
      }
      // Reload to get updated status (sync happens in loadPromotionStatus)
      await loadHistory();
    } catch (err: any) {
      console.error('Failed to promote to test:', err);
      let errorMessage = 'Failed to promote prompt to test';
      
      if (err.response?.status === 401) {
        errorMessage = 'Git authentication required. Please authenticate with your Git provider to save test settings.';
        // Open the Git auth modal for re-authentication
        setIsGitAuthModalOpen(true);
      } else if (err.response?.status === 400) {
        errorMessage = err.response.data?.detail || 'Project has no git repository configured';
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }

      if (onNotification) {
        onNotification({
          title: 'Failed to save test settings',
          variant: 'danger',
          message: errorMessage,
          actionButton: err.response?.status === 401 ? { text: 'Authenticate Now', onClick: () => setIsGitAuthModalOpen(true) } : undefined
        });
      }
    } finally {
      setIsPromoting(false);
    }
  };

  const handlePromoteToProduction = async (prompt: PromptHistory) => {
    // Check if the prompt is already in test
    const isInTest = promotionStatus.currentTest?.id === prompt.id;
    
    if (!isInTest) {
      if (onNotification) {
        onNotification({
          title: 'Cannot Promote to Production',
          variant: 'warning',
          message: 'This prompt must be promoted to test first before it can be promoted to production.'
        });
      }
      return;
    }

    try {
      setIsPromoting(true);
      const result = await api.tagPromptAsProd(project.id, prompt.id);

      if (onNotification) {
        onNotification({
          title: 'Success',
          variant: 'success',
          message: result.message || 'Pull request created for production deployment',
          actionLinks: result.pr_url ? [{ text: 'View PR', url: result.pr_url }] : []
        });
      }
      // Reload to get updated status (sync happens in loadPromotionStatus)
      await loadHistory();
    } catch (err: any) {
      console.error('Failed to promote to production:', err);
      let errorMessage = 'Failed to create production pull request';
      
      if (err.response?.status === 401) {
        errorMessage = 'Git authentication required. Please authenticate with your Git provider to create production pull requests.';
        // Open the Git auth modal for re-authentication
        setIsGitAuthModalOpen(true);
      } else if (err.response?.status === 400) {
        errorMessage = err.response.data?.detail || 'Project has no git repository configured';
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }

      if (onNotification) {
        onNotification({
          title: 'Failed to create production pull request',
          variant: 'danger',
          message: errorMessage,
          actionButton: err.response?.status === 401 ? { text: 'Authenticate Now', onClick: () => setIsGitAuthModalOpen(true) } : undefined
        });
      }
    } finally {
      setIsPromoting(false);
    }
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
                          {/* Production Badge */}
                          {promotionStatus.currentProd?.id === item.id && (
                            <Badge style={{ 
                              backgroundColor: '#3e8635',
                              color: '#ffffff',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '0.25rem 0.5rem',
                              borderRadius: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              minWidth: 'auto'
                            }}>
                              <StarIcon style={{ fontSize: '0.8rem', marginRight: '0.3rem' }} />
                              PROD
                            </Badge>
                          )}
                          {/* Test Badge */}
                          {promotionStatus.currentTest?.id === item.id && (
                            <Badge style={{ 
                              backgroundColor: '#2b9af3',
                              color: '#ffffff',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '0.25rem 0.5rem',
                              borderRadius: '12px',
                              minWidth: 'auto'
                            }}>
                              TEST
                            </Badge>
                          )}
                          {/* Pending PR Badge */}
                          {promotionStatus.pendingPRs.some(pr => pr.prompt_history_id === item.id) && (
                            <Badge variant="outline" style={{ 
                              color: '#0066cc', 
                              borderColor: '#0066cc',
                              fontSize: '0.6rem'
                            }}>
                              PR PENDING
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
                  {/* Status Badges */}
                  {promotionStatus.currentProd?.id === selectedPrompt.id && (
                    <Badge style={{ 
                      backgroundColor: '#3e8635', 
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      fontWeight: 600,
                      padding: '0.35rem 0.75rem',
                      borderRadius: '16px'
                    }}>
                      <StarIcon style={{ fontSize: '0.9rem', marginRight: '0.35rem' }} />
                      Production
                    </Badge>
                  )}
                  {promotionStatus.currentTest?.id === selectedPrompt.id && (
                    <Badge style={{ 
                      backgroundColor: '#2b9af3', 
                      color: '#ffffff',
                      fontWeight: 600,
                      padding: '0.35rem 0.75rem',
                      borderRadius: '16px'
                    }}>
                      Test
                    </Badge>
                  )}
                  {promotionStatus.pendingPRs.some(pr => pr.prompt_history_id === selectedPrompt.id) && (
                    <Badge style={{ 
                      backgroundColor: '#8a6914', 
                      color: '#ffffff',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '16px'
                    }}>
                      PR Pending
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Promotion Actions */}
              {!promotionStatus.pendingPRs.some(pr => pr.prompt_history_id === selectedPrompt.id) && (
                <div style={{ 
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f8f9fa',
                  borderBottom: '1px solid #d0d0d0'
                }}>
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center'
                  }}>
                    {/* Show Promote to Test button only if this prompt is NOT in test and NOT in production */}
                    {promotionStatus.currentTest?.id !== selectedPrompt.id && promotionStatus.currentProd?.id !== selectedPrompt.id && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setConfirmationPrompt(selectedPrompt);
                          setShowTestConfirmModal(true);
                        }}
                        isDisabled={isPromoting}
                        style={{ minWidth: '120px' }}
                      >
                        {isPromoting ? <Spinner size="sm" /> : 'Promote to Test'}
                      </Button>
                    )}
                    {/* Show Promote to Production button if prompt is in test */}
                    {promotionStatus.currentTest?.id === selectedPrompt.id && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setConfirmationPrompt(selectedPrompt);
                          setShowProdConfirmModal(true);
                        }}
                        isDisabled={isPromoting}
                        style={{ minWidth: '140px' }}
                      >
                        {isPromoting ? <Spinner size="sm" /> : 'Promote to Production'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              
              {/* PR Links for Pending PRs */}
              {promotionStatus.pendingPRs.filter(pr => pr.prompt_history_id === selectedPrompt.id).map(pr => (
                <div key={pr.id} style={{ 
                  padding: '0.75rem 1rem',
                  backgroundColor: '#e8f4fd',
                  borderBottom: '1px solid #d0d0d0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.875rem' }}>
                    🔄 PR #{pr.pr_number} pending review
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => window.open(pr.pr_url, '_blank')}
                  >
                    View PR
                  </Button>
                </div>
              ))}
            </div>

            {/* System Status Overview */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid #d0d0d0',
              backgroundColor: '#f8f9fa'
            }}>
              <Title headingLevel="h4" size="sm" style={{ margin: 0, marginBottom: '0.75rem' }}>
                System Status
              </Title>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '0.75rem' 
              }}>
                {/* Test Environment Status */}
                <div 
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d0d0d0',
                    borderRadius: '4px',
                    cursor: promotionStatus.currentTest ? 'pointer' : 'default',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => {
                    if (promotionStatus.currentTest) {
                      handlePromptSelect(promotionStatus.currentTest);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (promotionStatus.currentTest) {
                      e.currentTarget.style.backgroundColor = '#f0f8ff';
                      e.currentTarget.style.borderColor = '#2b9af3';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (promotionStatus.currentTest) {
                      e.currentTarget.style.backgroundColor = '#ffffff';
                      e.currentTarget.style.borderColor = '#d0d0d0';
                    }
                  }}
                  title={promotionStatus.currentTest ? 'Click to view test prompt details' : ''}
                >
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#666', 
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    marginBottom: '0.25rem'
                  }}>
                    Test Environment
                  </div>
                  {promotionStatus.currentTest ? (
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: 600,
                        color: '#ec7a08',
                        marginBottom: '0.25rem'
                      }}>
                        ✓ Active
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#666',
                        fontFamily: 'monospace'
                      }}>
                        ID: #{promotionStatus.currentTest.id}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#666'
                      }}>
                        {formatDate(promotionStatus.currentTest.created_at)}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: '#666',
                        marginBottom: '0.25rem'
                      }}>
                        No test prompt deployed
                      </div>
                    </div>
                  )}
                </div>

                {/* Production Environment Status */}
                <div 
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d0d0d0',
                    borderRadius: '4px',
                    cursor: promotionStatus.currentProd ? 'pointer' : 'default',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => {
                    if (promotionStatus.currentProd) {
                      handlePromptSelect(promotionStatus.currentProd);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (promotionStatus.currentProd) {
                      e.currentTarget.style.backgroundColor = '#f0f8ff';
                      e.currentTarget.style.borderColor = '#3e8635';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (promotionStatus.currentProd) {
                      e.currentTarget.style.backgroundColor = '#ffffff';
                      e.currentTarget.style.borderColor = '#d0d0d0';
                    }
                  }}
                  title={promotionStatus.currentProd ? 'Click to view production prompt details' : ''}
                >
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#666', 
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    marginBottom: '0.25rem'
                  }}>
                    Production Environment
                  </div>
                  {promotionStatus.currentProd ? (
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: 600,
                        color: '#3e8635',
                        marginBottom: '0.25rem'
                      }}>
                        ✓ Active
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#666',
                        fontFamily: 'monospace'
                      }}>
                        ID: #{promotionStatus.currentProd.id}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#666'
                      }}>
                        {formatDate(promotionStatus.currentProd.created_at)}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: '#666',
                        marginBottom: '0.25rem'
                      }}>
                        No production prompt deployed
                      </div>
                    </div>
                  )}
                </div>

                {/* Pending PRs Status */}
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #d0d0d0',
                  borderRadius: '4px'
                }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#666', 
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    marginBottom: '0.25rem'
                  }}>
                    Pending Pull Requests
                  </div>
                  {promotionStatus.pendingPRs.length > 0 ? (
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: 600,
                        color: '#0066cc',
                        marginBottom: '0.25rem'
                      }}>
                        {promotionStatus.pendingPRs.length} pending
                      </div>
                      {promotionStatus.pendingPRs.slice(0, 2).map(pr => (
                        <div key={pr.id} style={{ 
                          fontSize: '0.75rem', 
                          color: '#666',
                          marginBottom: '0.125rem'
                        }}>
                          PR #{pr.pr_number} (ID: #{pr.prompt_history_id})
                        </div>
                      ))}
                      {promotionStatus.pendingPRs.length > 2 && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: '#666',
                          fontStyle: 'italic'
                        }}>
                          +{promotionStatus.pendingPRs.length - 2} more...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: '#666',
                        marginBottom: '0.25rem'
                      }}>
                        No pending PRs
                      </div>
                    </div>
                  )}
                </div>

                {/* Git Authentication Status */}
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #d0d0d0',
                  borderRadius: '4px'
                }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#666', 
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    marginBottom: '0.5rem'
                  }}>
                    Git Authentication
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    {gitAuthStatus.authenticated && gitAuthStatus.user ? (
                      <div style={{ 
                        fontSize: '0.875rem',
                        color: '#333',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          backgroundColor: '#3e8635',
                          borderRadius: '50%'
                        }} />
                        <span>
                          {gitAuthStatus.user.username} ({gitAuthStatus.user.platform}
                          {gitAuthStatus.user.server_url && gitAuthStatus.user.server_url !== 'https://github.com' && gitAuthStatus.user.server_url !== 'https://gitlab.com' ? 
                            ` - ${new URL(gitAuthStatus.user.server_url).hostname}` : 
                            ''
                          })
                        </span>
                      </div>
                    ) : (
                      <div style={{ 
                        fontSize: '0.875rem',
                        color: '#c9190b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          backgroundColor: '#c9190b',
                          borderRadius: '50%'
                        }} />
                        <span>Not authenticated</span>
                      </div>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setIsGitAuthModalOpen(true)}
                      style={{ 
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      {gitAuthStatus.authenticated ? 'Reconfigure' : 'Authenticate'}
                    </Button>
                  </div>
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
      
      {/* Git Authentication Modal */}
      <GitAuthModal
        isOpen={isGitAuthModalOpen}
        onClose={() => setIsGitAuthModalOpen(false)}
        onSubmit={handleGitAuth}
        isAuthenticating={isAuthenticating}
      />
      
      {/* Test Promotion Confirmation Modal */}
      <Modal
        variant={ModalVariant.large}
        isOpen={showTestConfirmModal}
        width="700px"
        onClose={() => {
          setShowTestConfirmModal(false);
          setConfirmationPrompt(null);
        }}
      >
        <ModalHeader title="Promote to Test" />
        <ModalBody>
          <Stack hasGutter>
            <StackItem>
              <div style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                Are you sure you want to promote this prompt to test?
              </div>
            </StackItem>
            {promotionStatus.currentTest && (
              <StackItem>
                <div style={{ color: '#8a6914', padding: '0.75rem', backgroundColor: '#fdf2e9', borderRadius: '4px', marginBottom: '1rem' }}>
                  ⚠️ This will replace the current test prompt (ID #{promotionStatus.currentTest.id}) deployed on {formatDate(promotionStatus.currentTest.created_at)}.
                </div>
              </StackItem>
            )}
            <StackItem>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '1rem' }}>
                This action will commit the prompt configuration to your Git repository as the new test settings.
              </div>
            </StackItem>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => {
              if (confirmationPrompt) {
                handlePromoteToTest(confirmationPrompt);
              }
              setShowTestConfirmModal(false);
              setConfirmationPrompt(null);
            }}
            isDisabled={isPromoting}
          >
            {isPromoting ? <Spinner size="sm" /> : 'Promote to Test'}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setShowTestConfirmModal(false);
              setConfirmationPrompt(null);
            }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
      
      {/* Production Promotion Confirmation Modal */}
      <Modal
        variant={ModalVariant.large}
        isOpen={showProdConfirmModal}
        width="700px"
        onClose={() => {
          setShowProdConfirmModal(false);
          setConfirmationPrompt(null);
        }}
      >
        <ModalHeader title="Promote to Production" />
        <ModalBody>
          <Stack hasGutter>
            <StackItem>
              <div style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                Are you sure you want to promote this prompt to production?
              </div>
            </StackItem>
            {promotionStatus.currentProd && (
              <StackItem>
                <div style={{ color: '#8a6914', padding: '0.75rem', backgroundColor: '#fdf2e9', borderRadius: '4px', marginBottom: '1rem' }}>
                  ⚠️ This will create a pull request to replace the current production prompt (ID #{promotionStatus.currentProd.id}) deployed on {formatDate(promotionStatus.currentProd.created_at)}.
                </div>
              </StackItem>
            )}
            <StackItem>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '1rem' }}>
                This action will create a pull request in your Git repository. The changes will only take effect after the PR is reviewed and merged.
              </div>
            </StackItem>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => {
              if (confirmationPrompt) {
                handlePromoteToProduction(confirmationPrompt);
              }
              setShowProdConfirmModal(false);
              setConfirmationPrompt(null);
            }}
            isDisabled={isPromoting}
          >
            {isPromoting ? <Spinner size="sm" /> : 'Create Pull Request'}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setShowProdConfirmModal(false);
              setConfirmationPrompt(null);
            }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};