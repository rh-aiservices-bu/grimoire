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
} from '@patternfly/react-core';
import { Project } from '../types';

interface ProjectEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string; llamastackUrl: string; providerId: string }) => void;
  project: Project | null;
}

export const ProjectEditModal: React.FC<ProjectEditModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  project 
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [llamastackUrl, setLlamastackUrl] = useState('');
  const [providerId, setProviderId] = useState('');

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
      setLlamastackUrl(project.llamastack_url);
      setProviderId(project.provider_id);
    }
  }, [project]);

  const handleSubmit = () => {
    if (name && llamastackUrl && providerId) {
      onSubmit({ 
        name, 
        description: description || undefined, 
        llamastackUrl, 
        providerId 
      });
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
    // Reset form when closing
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
      setLlamastackUrl(project.llamastack_url);
      setProviderId(project.provider_id);
    }
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Edit Project"
      isOpen={isOpen}
      onClose={handleClose}
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
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button key="save" variant="primary" onClick={handleSubmit}>
          Save Changes
        </Button>
        <Button key="cancel" variant="link" onClick={handleClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};