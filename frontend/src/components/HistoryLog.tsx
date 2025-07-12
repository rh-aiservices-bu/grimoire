import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  Button,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Flex,
  FlexItem,
  Badge,
  FormSelect,
  FormSelectOption,
  Alert,
  Spinner,
} from '@patternfly/react-core';
import { ThumbsUpIcon, ThumbsDownIcon, EditIcon, StarIcon, SyncAltIcon } from '@patternfly/react-icons';
import { PromptHistory, PendingPR, GitUser } from '../types';
import { NotesModal } from './NotesModal';
import { ProdConfirmationModal } from './ProdConfirmationModal';
import { api } from '../api';

interface HistoryLogProps {
  history: PromptHistory[];
  onHistoryUpdate: () => void;
  projectId: number;
  hasGitRepo?: boolean;
  gitUser?: GitUser | null;
  onGitAuth?: () => void;
  onNotification?: (notification: {
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }) => void;
  viewMode?: 'experimental' | 'prod';
  onViewModeChange?: (mode: 'experimental' | 'prod') => void;
}

export const HistoryLog: React.FC<HistoryLogProps> = ({ 
  history, 
  onHistoryUpdate, 
  projectId, 
  hasGitRepo = false, 
  gitUser, 
  onGitAuth, 
  onNotification,
  viewMode: externalViewMode,
  onViewModeChange: externalOnViewModeChange
}) => {
  const [selectedItem, setSelectedItem] = useState<PromptHistory | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [notesItem, setNotesItem] = useState<PromptHistory | null>(null);
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [prodItem, setProdItem] = useState<PromptHistory | null>(null);
  // Use external view mode if provided, otherwise internal state
  const [internalViewMode, setInternalViewMode] = useState<'experimental' | 'prod'>('experimental');
  const viewMode = externalViewMode ?? internalViewMode;
  const setViewMode = externalOnViewModeChange ?? setInternalViewMode;
  const [prodHistory, setProdHistory] = useState<PromptHistory[]>([]);
  const [pendingPRs, setPendingPRs] = useState<PendingPR[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cache for production history and pending PRs
  const prodHistoryCache = useRef<Map<number, { data: PromptHistory[]; timestamp: number }>>(new Map());
  const pendingPRsCache = useRef<Map<number, { data: PendingPR[]; timestamp: number }>>(new Map());
  const CACHE_DURATION = 60000; // 60 seconds cache (backend is now smarter with incremental sync)
  const MAX_CACHE_SIZE = 10; // Limit cache to prevent memory growth
  
  // Cache cleanup utility
  const cleanupCache = (cache: Map<number, { data: any; timestamp: number }>) => {
    const now = Date.now();
    // Remove expired entries
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_DURATION) {
        cache.delete(key);
      }
    }
    // Remove oldest entries if cache is too large
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const entriesToRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
      entriesToRemove.forEach(([key]) => cache.delete(key));
    }
  };

  const handleItemClick = (item: PromptHistory) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const handleRating = async (item: PromptHistory, rating: 'thumbs_up' | 'thumbs_down') => {
    try {
      const newRating = item.rating === rating ? null : rating; // Toggle if same rating
      await api.updatePromptHistory(item.project_id, item.id, { rating: newRating });
      onHistoryUpdate();
    } catch (error) {
      console.error('Failed to update rating:', error);
    }
  };

  const handleNotesClick = (item: PromptHistory) => {
    setNotesItem(item);
    setIsNotesModalOpen(true);
  };

  const handleSaveNotes = async (notes: string) => {
    if (!notesItem) return;
    
    try {
      await api.updatePromptHistory(notesItem.project_id, notesItem.id, { notes });
      onHistoryUpdate();
    } catch (error) {
      console.error('Failed to save notes:', error);
    }
  };

  const handleProdClick = (item: PromptHistory) => {
    setProdItem(item);
    setIsProdModalOpen(true);
  };

  const handleProdConfirm = async () => {
    if (!prodItem) return;
    
    setIsCreatingPR(true);
    try {
      if (hasGitRepo && !prodItem.is_prod) {
        // Check if user is authenticated with git
        if (!gitUser) {
          alert('Please authenticate with git first to create pull requests.');
          if (onGitAuth) {
            onGitAuth();
          }
          return;
        }
        
        try {
          // Create git PR instead of direct database update
          const result = await api.tagPromptAsProd(projectId, prodItem.id);
          console.log('PR created:', result);
          
          // Show success notification with link to PR
          if (onNotification) {
            onNotification({
              title: 'Pull Request Created Successfully',
              variant: 'success',
              message: `PR #${result.pr_number} has been created. Click the link below to review and merge it.`,
              actionLinks: [{ text: `View PR #${result.pr_number}`, url: result.pr_url }]
            });
          }
        } catch (prError: any) {
          // Handle platform-specific errors
          if (prError.response?.status === 501) {
            if (onNotification) {
              onNotification({
                title: 'Feature Not Available',
                variant: 'warning',
                message: `Pull request creation is not yet supported for ${gitUser?.git_platform}.`,
              });
            }
            return; // Don't fall through to generic error handling
          }
          
          // Handle empty repository error
          if (prError.response?.status === 400 && prError.response?.data?.detail?.includes('git repository is empty')) {
            if (onNotification) {
              onNotification({
                title: 'Empty Repository',
                variant: 'warning',
                message: prError.response.data.detail,
              });
            }
            return; // Don't fall through to generic error handling
          }
          
          throw prError; // Re-throw for generic error handling
        }
        
        // Invalidate cache and refresh pending PRs and prod history
        console.log('PR created - invalidating cache and refreshing data');
        prodHistoryCache.current.delete(projectId);
        pendingPRsCache.current.delete(projectId);
        
        if (viewMode === 'prod') {
          await Promise.all([loadPendingPRs(true), loadProdHistory(false, true)]);
        }
      } else {
        // Original behavior for projects without git repo
        const newProdStatus = !prodItem.is_prod;
        await api.updatePromptHistory(prodItem.project_id, prodItem.id, { is_prod: newProdStatus });
        onHistoryUpdate();
      }
    } catch (error) {
      console.error('Failed to update production status:', error);
      if (onNotification) {
        onNotification({
          title: 'Pull Request Creation Failed',
          variant: 'danger',
          message: 'Failed to create pull request. This might be due to invalid git credentials or insufficient repository permissions.',
          actionButton: onGitAuth ? { 
            text: 'Re-authenticate with Git', 
            onClick: onGitAuth 
          } : undefined
        });
      }
    } finally {
      setIsCreatingPR(false);
    }
  };

  const loadProdHistory = async (isManualRefresh = false, forceRefresh = false) => {
    if (!hasGitRepo) return;
    
    // Check cache first (unless manual refresh or force refresh)
    if (!isManualRefresh && !forceRefresh) {
      const cached = prodHistoryCache.current.get(projectId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Using cached prod history for project ${projectId}`);
        setProdHistory(cached.data);
        return;
      }
    }
    
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      console.log(`Fetching fresh prod history for project ${projectId}`);
      const gitHistory = await api.getProdHistoryFromGit(projectId);
      setProdHistory(gitHistory);
      
      // Cache the result
      prodHistoryCache.current.set(projectId, {
        data: gitHistory,
        timestamp: Date.now()
      });
      
      // Cleanup cache periodically
      cleanupCache(prodHistoryCache.current);
    } catch (error) {
      console.error('Failed to load prod history from git:', error);
      setProdHistory([]);
    } finally {
      if (isManualRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  const loadPendingPRs = async (forceRefresh = false) => {
    if (!hasGitRepo || !gitUser) return;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = pendingPRsCache.current.get(projectId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Using cached pending PRs for project ${projectId}`);
        setPendingPRs(cached.data);
        return;
      }
    }
    
    try {
      console.log(`Fetching fresh pending PRs for project ${projectId}`);
      // This now does live checking automatically
      const prs = await api.getPendingPRs(projectId);
      setPendingPRs(prs);
      
      // Cache the result
      pendingPRsCache.current.set(projectId, {
        data: prs,
        timestamp: Date.now()
      });
      
      // Cleanup cache periodically
      cleanupCache(pendingPRsCache.current);
    } catch (error) {
      console.error('Failed to load pending PRs:', error);
      setPendingPRs([]);
    }
  };

  const handleManualRefresh = async () => {
    if (!hasGitRepo || !gitUser) return;
    console.log('Manual refresh triggered - bypassing cache');
    await Promise.all([
      loadProdHistory(true, true), // isManualRefresh=true, forceRefresh=true
      loadPendingPRs(true) // forceRefresh=true
    ]);
  };

  // Auto-refresh prod data when git user changes or view mode changes
  useEffect(() => {
    if (viewMode === 'prod' && hasGitRepo && gitUser) {
      loadProdHistory();
      loadPendingPRs();
    }
  }, [gitUser, viewMode, hasGitRepo]);

  // Set up auto-refresh interval for production view
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    // Set up new interval if conditions are met
    if (viewMode === 'prod' && hasGitRepo && gitUser) {
      refreshIntervalRef.current = setInterval(() => {
        console.log('Auto-refreshing production history (force refresh)...');
        loadProdHistory(false, true); // isManualRefresh=false, forceRefresh=true
        loadPendingPRs(true); // forceRefresh=true
      }, 30000); // 30 seconds
    }

    // Cleanup function
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [viewMode, hasGitRepo, gitUser, projectId]);

  const handleViewModeChange = (mode: 'experimental' | 'prod') => {
    setViewMode(mode);
    if (mode === 'prod' && hasGitRepo && gitUser) {
      loadProdHistory();
      loadPendingPRs();
    }
  };

  const currentHistory = viewMode === 'experimental' ? history.filter(h => !h.is_prod) : prodHistory;

  return (
    <>
      <Card isFullHeight>
        <CardTitle>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            <FlexItem>History Log</FlexItem>
            {hasGitRepo && (
              <FlexItem>
                <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                  {viewMode === 'prod' && gitUser && (
                    <FlexItem>
                      <Button
                        variant="plain"
                        size="sm"
                        icon={isRefreshing ? <Spinner size="sm" /> : <SyncAltIcon />}
                        onClick={handleManualRefresh}
                        isDisabled={isRefreshing}
                        title="Refresh production history from git"
                      >
                        {isRefreshing ? 'Refreshing...' : ''}
                      </Button>
                    </FlexItem>
                  )}
                  <FlexItem>
                    <FormSelect
                      value={viewMode}
                      onChange={(_event, value) => handleViewModeChange(value as 'experimental' | 'prod')}
                      aria-label="Select history view"
                      style={{ width: '150px' }}
                    >
                      <FormSelectOption key="experimental" value="experimental" label="Experimental" />
                      <FormSelectOption key="prod" value="prod" label="Production" />
                    </FormSelect>
                  </FlexItem>
                </Flex>
              </FlexItem>
            )}
          </Flex>
        </CardTitle>
        <CardBody>
          {hasGitRepo && !gitUser && (
            <Alert variant="warning" title="Git Authentication Required" style={{ marginBottom: '1rem' }}>
              <p>This project uses git for production prompts. Please authenticate with your git platform to create pull requests.</p>
              {onGitAuth && (
                <Button variant="primary" size="sm" onClick={onGitAuth} style={{ marginTop: '0.5rem' }}>
                  Authenticate with Git
                </Button>
              )}
            </Alert>
          )}

          {hasGitRepo && gitUser && (
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '14px' }}>
              <span>📡 Git: {gitUser.git_username}@{gitUser.git_platform}</span>
              {onGitAuth && (
                <Button variant="link" size="sm" onClick={onGitAuth}>
                  Re-authenticate
                </Button>
              )}
            </div>
          )}


          {viewMode === 'prod' && hasGitRepo && pendingPRs.length > 0 && (
            <Alert variant="info" title="Pending Pull Requests" style={{ marginBottom: '1rem' }}>
              <p>There are {pendingPRs.length} pending pull request(s) for production prompts:</p>
              <ul style={{ marginTop: '0.5rem' }}>
                {pendingPRs.map(pr => (
                  <li key={pr.id}>
                    <a href={pr.pr_url} target="_blank" rel="noopener noreferrer">
                      PR #{pr.pr_number}
                    </a>
                    {' - '}
                    {new Date(pr.created_at).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {viewMode === 'prod' && hasGitRepo && prodHistory.length === 0 && pendingPRs.length === 0 && !isLoading && (
            <Alert variant="warning" title="No Production Prompts" style={{ marginBottom: '1rem' }}>
              <p>No prompts have been tagged as production yet, or pending PRs have not been merged.</p>
              <p>Tag a prompt with the production label to create a pull request in your git repository.</p>
            </Alert>
          )}

          {currentHistory.length === 0 && !isLoading ? (
            <p>
              {viewMode === 'experimental' 
                ? "No experimental history yet. Generate some responses to see them here."
                : hasGitRepo 
                  ? "No production prompts found in git repository."
                  : "No history yet. Generate some responses to see them here."
              }
            </p>
          ) : (
            <div style={{ 
              maxHeight: 'calc(100vh - 300px)', 
              overflowY: 'auto',
              paddingRight: '0.5rem'
            }}>
              {currentHistory.map((item, index) => (
                <div 
                  key={item.id}
                  style={{ 
                    padding: '1rem',
                    borderBottom: '1px solid #e5e5e5',
                    marginBottom: '0.5rem',
                    // Highlight the currently served prompt (first in production list)
                    backgroundColor: viewMode === 'prod' && index === 0 ? '#f0f8ff' : 'transparent',
                    borderLeft: viewMode === 'prod' && index === 0 ? '4px solid #0066cc' : 'none',
                    borderRadius: viewMode === 'prod' && index === 0 ? '4px' : '0'
                  }}
                >
                  <div 
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleItemClick(item)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <small style={{ color: '#6a6e73' }}>
                        {formatDate(item.created_at)}
                      </small>
                      {/* Show PROD badge only in experimental view, and show "CURRENT" badge for active prompt in prod view */}
                      {viewMode === 'experimental' && item.is_prod && (
                        <Badge>
                          <StarIcon style={{ fontSize: '12px', marginRight: '4px' }} />
                          PROD
                        </Badge>
                      )}
                      {viewMode === 'prod' && index === 0 && (
                        <Badge variant="outline" color="blue">
                          ⚡ CURRENT
                        </Badge>
                      )}
                    </div>
                    <p style={{ fontWeight: 'bold', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
                      {truncateText(item.user_prompt)}
                    </p>
                    {item.response && (
                      <small style={{ marginTop: '0.25rem', display: 'block' }}>
                        {truncateText(item.response)}
                      </small>
                    )}
                  </div>
                  
                  <Flex style={{ marginTop: '0.5rem' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                      <Button
                        variant={item.rating === 'thumbs_up' ? 'primary' : 'tertiary'}
                        icon={<ThumbsUpIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRating(item, 'thumbs_up');
                        }}
                        size="sm"
                      />
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant={item.rating === 'thumbs_down' ? 'primary' : 'tertiary'}
                        icon={<ThumbsDownIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRating(item, 'thumbs_down');
                        }}
                        size="sm"
                      />
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant={item.notes ? 'primary' : 'tertiary'}
                        icon={<EditIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNotesClick(item);
                        }}
                        size="sm"
                      >
                        Notes
                      </Button>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant={item.is_prod ? 'primary' : 'tertiary'}
                        icon={isCreatingPR && prodItem?.id === item.id ? <Spinner size="sm" /> : <StarIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProdClick(item);
                        }}
                        size="sm"
                        title={item.is_prod ? 'Remove production tag' : 'Mark as production'}
                        isDisabled={isCreatingPR && prodItem?.id === item.id}
                      />
                    </FlexItem>
                  </Flex>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        variant={ModalVariant.large}
        title="Prompt History Detail"
        isOpen={isModalOpen}
        onClose={closeModal}
      >
        <ModalHeader />
        <ModalBody>
          {selectedItem && (
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>Timestamp</DescriptionListTerm>
                <DescriptionListDescription>
                  {formatDate(selectedItem.created_at)}
                </DescriptionListDescription>
              </DescriptionListGroup>

              <DescriptionListGroup>
                <DescriptionListTerm>User Prompt</DescriptionListTerm>
                <DescriptionListDescription>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {selectedItem.user_prompt}
                  </pre>
                </DescriptionListDescription>
              </DescriptionListGroup>

              {selectedItem.system_prompt && (
                <DescriptionListGroup>
                  <DescriptionListTerm>System Prompt</DescriptionListTerm>
                  <DescriptionListDescription>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {selectedItem.system_prompt}
                    </pre>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}

              {selectedItem.variables && Object.keys(selectedItem.variables).length > 0 && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Variables</DescriptionListTerm>
                  <DescriptionListDescription>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {Object.entries(selectedItem.variables)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n')}
                    </pre>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}

              <DescriptionListGroup>
                <DescriptionListTerm>Model Parameters</DescriptionListTerm>
                <DescriptionListDescription>
                  Temperature: {selectedItem.temperature ?? 'N/A'}<br />
                  Max Length: {selectedItem.max_len ?? 'N/A'}<br />
                  Top P: {selectedItem.top_p ?? 'N/A'}<br />
                  Top K: {selectedItem.top_k ?? 'N/A'}
                </DescriptionListDescription>
              </DescriptionListGroup>

              {selectedItem.response && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Response</DescriptionListTerm>
                  <DescriptionListDescription>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {selectedItem.response}
                    </pre>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}

              {selectedItem.rating && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Rating</DescriptionListTerm>
                  <DescriptionListDescription>
                    {selectedItem.rating === 'thumbs_up' ? '👍 Thumbs Up' : '👎 Thumbs Down'}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}

              {selectedItem.notes && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Notes</DescriptionListTerm>
                  <DescriptionListDescription>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {selectedItem.notes}
                    </pre>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}

              <DescriptionListGroup>
                <DescriptionListTerm>Production Status</DescriptionListTerm>
                <DescriptionListDescription>
                  {selectedItem.is_prod ? (
                    <Badge>
                      <StarIcon style={{ fontSize: '12px', marginRight: '4px' }} />
                      PROD
                    </Badge>
                  ) : (
                    'Not marked as production'
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          )}
        </ModalBody>
        <ModalFooter>
          <Button key="close" variant="primary" onClick={closeModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <NotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onSave={handleSaveNotes}
        initialNotes={notesItem?.notes || ''}
      />

      <ProdConfirmationModal
        isOpen={isProdModalOpen}
        onClose={() => setIsProdModalOpen(false)}
        onConfirm={handleProdConfirm}
        isCurrentlyProd={prodItem?.is_prod || false}
        hasGitRepo={hasGitRepo}
      />
    </>
  );
};