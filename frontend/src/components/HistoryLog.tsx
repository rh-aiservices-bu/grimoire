import React, { useState } from 'react';
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
} from '@patternfly/react-core';
import { ThumbsUpIcon, ThumbsDownIcon, EditIcon } from '@patternfly/react-icons';
import { PromptHistory } from '../types';
import { NotesModal } from './NotesModal';
import { api } from '../api';

interface HistoryLogProps {
  history: PromptHistory[];
  onHistoryUpdate: () => void;
}

export const HistoryLog: React.FC<HistoryLogProps> = ({ history, onHistoryUpdate }) => {
  const [selectedItem, setSelectedItem] = useState<PromptHistory | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [notesItem, setNotesItem] = useState<PromptHistory | null>(null);

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

  return (
    <>
      <Card isFullHeight>
        <CardTitle>History Log</CardTitle>
        <CardBody>
          {history.length === 0 ? (
            <p>No history yet. Generate some responses to see them here.</p>
          ) : (
            <div>
              {history.map((item) => (
                <div 
                  key={item.id}
                  style={{ 
                    padding: '1rem',
                    borderBottom: '1px solid #e5e5e5',
                    marginBottom: '0.5rem'
                  }}
                >
                  <div 
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleItemClick(item)}
                  >
                    <small style={{ color: '#6a6e73' }}>
                      {formatDate(item.created_at)}
                    </small>
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
    </>
  );
};