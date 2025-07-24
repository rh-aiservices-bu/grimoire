import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextInput,
  TextArea,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tooltip,
  Flex,
  FlexItem,
} from '@patternfly/react-core';
import { QuestionCircleIcon } from '@patternfly/react-icons';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string; llamastackUrl: string; providerId: string; gitRepoUrl?: string; testBackendUrl?: string }) => void;
  isCreating?: boolean;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose, onSubmit, isCreating = false }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [llamastackUrl, setLlamastackUrl] = useState('');
  const [providerId, setProviderId] = useState('');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [testBackendUrl, setTestBackendUrl] = useState('');

  const resetForm = () => {
    setName('');
    setDescription('');
    setLlamastackUrl('');
    setProviderId('');
    setGitRepoUrl('');
    setTestBackendUrl('');
  };

  const handleSubmit = () => {
    if (name && llamastackUrl && providerId && !isCreating) {
      onSubmit({ 
        name, 
        description: description || undefined, 
        llamastackUrl, 
        providerId, 
        gitRepoUrl: gitRepoUrl || undefined,
        testBackendUrl: testBackendUrl || undefined
      });
    }
  };

  // Close modal and reset form when creation completes successfully
  useEffect(() => {
    if (!isCreating && !isOpen) {
      resetForm();
    }
  }, [isCreating, isOpen]);

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Create New Project"
      isOpen={isOpen}
      onClose={onClose}
    >
      <ModalHeader />
      <ModalBody>
        <Form>
          <FormGroup label="Project Name" isRequired fieldId="project-name">
            <TextInput
              isRequired
              type="text"
              id="project-name"
              name="project-name"
              value={name}
              onChange={(_event, value) => setName(value)}
            />
          </FormGroup>
          <FormGroup label="Description" fieldId="project-description">
            <TextArea
              id="project-description"
              name="project-description"
              value={description}
              onChange={(_event, value) => setDescription(value)}
              placeholder="Optional description of the project"
              rows={3}
            />
          </FormGroup>
          <FormGroup label="Llama Stack URL" isRequired fieldId="llamastack-url">
            <TextInput
              isRequired
              type="url"
              id="llamastack-url"
              name="llamastack-url"
              value={llamastackUrl}
              onChange={(_event, value) => setLlamastackUrl(value)}
              placeholder="http://localhost:8000"
            />
          </FormGroup>
          <FormGroup label="Provider ID (Model Name)" isRequired fieldId="provider-id">
            <TextInput
              isRequired
              type="text"
              id="provider-id"
              name="provider-id"
              value={providerId}
              onChange={(_event, value) => setProviderId(value)}
              placeholder="llama-3.1-8b-instruct"
            />
          </FormGroup>
          <FormGroup 
            label={
              <Flex alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>Git Repository URL (Optional)</FlexItem>
                <FlexItem>
                  <Tooltip content="Connect to a Git repository to enable production workflow. Production prompts and configurations are stored as JSON files in the repository, allowing version control and team collaboration.">
                    <QuestionCircleIcon style={{ 
                      marginLeft: '2px', 
                      color: 'black', 
                      backgroundColor: 'white', 
                      borderRadius: '50%',
                      border: '1px solid black',
                      fontSize: '14px'
                    }} />
                  </Tooltip>
                </FlexItem>
              </Flex>
            } 
            fieldId="git-repo-url"
          >
            <TextInput
              type="url"
              id="git-repo-url"
              name="git-repo-url"
              value={gitRepoUrl}
              onChange={(_event, value) => setGitRepoUrl(value)}
              placeholder="https://github.com/username/repo"
            />
          </FormGroup>
          <FormGroup 
            label={"Test Backend URL (Optional)"}
            fieldId="test-backend-url"
          >
            <TextInput
              type="url"
              id="test-backend-url"
              name="test-backend-url"
              value={testBackendUrl}
              onChange={(_event, value) => setTestBackendUrl(value)}
              placeholder="http://backend:8080/chat"
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button 
          key="create" 
          variant="primary" 
          onClick={handleSubmit}
          isLoading={isCreating}
          isDisabled={isCreating || !name || !llamastackUrl || !providerId}
        >
          {isCreating ? 'Creating Project...' : 'Create Project'}
        </Button>
        <Button 
          key="cancel" 
          variant="link" 
          onClick={onClose}
          isDisabled={isCreating}
        >
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};