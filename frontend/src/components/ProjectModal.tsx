import React, { useState } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextInput,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; llamastackUrl: string; providerId: string }) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [llamastackUrl, setLlamastackUrl] = useState('');
  const [providerId, setProviderId] = useState('');

  const handleSubmit = () => {
    if (name && llamastackUrl && providerId) {
      onSubmit({ name, llamastackUrl, providerId });
      setName('');
      setLlamastackUrl('');
      setProviderId('');
      onClose();
    }
  };

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
          <FormGroup label="Llamastack URL" isRequired fieldId="llamastack-url">
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
        <Button key="create" variant="primary" onClick={handleSubmit}>
          Create Project
        </Button>
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};