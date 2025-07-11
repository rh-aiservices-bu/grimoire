import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Title,
  Card,
  CardTitle,
  CardBody,
  Flex,
  FlexItem,
  CodeBlock,
  CodeBlockCode,
  ClipboardCopy,
  Alert,
  List,
  ListItem,
  Divider,
  Split,
  SplitItem,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon, CopyIcon } from '@patternfly/react-icons';

interface ApiDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiDocumentationModal: React.FC<ApiDocumentationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [baseUrl, setBaseUrl] = useState('http://localhost:3001');

  useEffect(() => {
    // Use environment variable or fallback to localhost
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    setBaseUrl(backendUrl);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Modal
      variant={ModalVariant.large}
      title="API Documentation & Integration"
      isOpen={isOpen}
      onClose={onClose}
      hasNoBodyWrapper
    >
      <ModalHeader>
        <Title headingLevel="h1" size="lg">
          API Documentation & External Integration
        </Title>
        <p>Access prompt configurations and project data programmatically</p>
      </ModalHeader>
      
      <ModalBody style={{ padding: '1.5rem' }}>
        {/* Quick Links */}
        <Card style={{ marginBottom: '1.5rem' }}>
          <CardTitle>🚀 Interactive Documentation</CardTitle>
          <CardBody>
            <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem>
                <Split hasGutter>
                  <SplitItem isFilled>
                    <strong>Swagger UI (Interactive Testing)</strong>
                    <br />
                    <small>Test all endpoints with live examples</small>
                  </SplitItem>
                  <SplitItem>
                    <Button
                      variant="link"
                      icon={<ExternalLinkAltIcon />}
                      iconPosition="right"
                      component="a"
                      href={`${baseUrl}/docs`}
                      target="_blank"
                    >
                      Open Swagger UI
                    </Button>
                  </SplitItem>
                </Split>
              </FlexItem>
              
              <FlexItem>
                <Split hasGutter>
                  <SplitItem isFilled>
                    <strong>ReDoc (Clean Documentation)</strong>
                    <br />
                    <small>Browse comprehensive API documentation</small>
                  </SplitItem>
                  <SplitItem>
                    <Button
                      variant="link"
                      icon={<ExternalLinkAltIcon />}
                      iconPosition="right"
                      component="a"
                      href={`${baseUrl}/redoc`}
                      target="_blank"
                    >
                      Open ReDoc
                    </Button>
                  </SplitItem>
                </Split>
              </FlexItem>
            </Flex>
          </CardBody>
        </Card>

        {/* External Endpoints */}
        <Card style={{ marginBottom: '1.5rem' }}>
          <CardTitle>🌍 Key External Endpoints</CardTitle>
          <CardBody>
            
            {/* Projects List Endpoint */}
            <div style={{ marginBottom: '1.5rem' }}>
              <Title headingLevel="h4" size="md">Get All Projects and Models</Title>
              <p style={{ marginBottom: '0.5rem' }}>
                Discover all available projects and their model configurations
              </p>
              <ClipboardCopy
                hoverTip="Copy"
                clickTip="Copied"
                variant="expansion"
                isReadOnly
              >
                {`GET ${baseUrl}/api/projects-models`}
              </ClipboardCopy>
              
              <div style={{ marginTop: '1rem' }}>
                <strong>Example Response:</strong>
                <CodeBlock>
                  <CodeBlockCode>
{`{
  "projects": [
    {
      "name": "newsummary",
      "provider_id": "llama32-full",
      "llamastack_url": "http://llama-stack-server.example.com"
    }
  ]
}`}
                  </CodeBlockCode>
                </CodeBlock>
              </div>
            </div>

            <Divider style={{ margin: '1rem 0' }} />

            {/* Latest Prompt Endpoint */}
            <div style={{ marginBottom: '1rem' }}>
              <Title headingLevel="h4" size="md">Get Latest Prompt Configuration</Title>
              <p style={{ marginBottom: '0.5rem' }}>
                Retrieve the most recent prompt setup for a specific project and model
              </p>
              <ClipboardCopy
                hoverTip="Copy"
                clickTip="Copied"
                variant="expansion"
                isReadOnly
              >
                {`GET ${baseUrl}/prompt/{project_name}/{provider_id}`}
              </ClipboardCopy>
              
              <div style={{ marginTop: '1rem' }}>
                <strong>Example:</strong>
                <ClipboardCopy
                  hoverTip="Copy"
                  clickTip="Copied"
                  variant="expansion"
                  isReadOnly
                >
                  {`GET ${baseUrl}/prompt/newsummary/llama32-full`}
                </ClipboardCopy>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <strong>Example Response:</strong>
                <CodeBlock>
                  <CodeBlockCode>
{`{
  "userPrompt": "Summarize: {{content}}",
  "systemPrompt": "You are a helpful summarizer",
  "temperature": 0.7,
  "maxLen": 1000,
  "topP": 0.9,
  "topK": 50,
  "variables": {
    "content": "Article text here..."
  }
}`}
                  </CodeBlockCode>
                </CodeBlock>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Integration Examples */}
        <Card style={{ marginBottom: '1.5rem' }}>
          <CardTitle>💻 Integration Examples</CardTitle>
          <CardBody>
            
            {/* cURL Examples */}
            <div style={{ marginBottom: '1.5rem' }}>
              <Title headingLevel="h4" size="md">cURL Commands</Title>
              <CodeBlock>
                <CodeBlockCode>
{`# Get all projects and models
curl ${baseUrl}/api/projects-models

# Get latest prompt configuration
curl ${baseUrl}/prompt/newsummary/llama32-full`}
                </CodeBlockCode>
              </CodeBlock>
            </div>

            {/* Python Example */}
            <div style={{ marginBottom: '1.5rem' }}>
              <Title headingLevel="h4" size="md">Python Integration</Title>
              <CodeBlock>
                <CodeBlockCode>
{`import requests

# Get available projects
response = requests.get("${baseUrl}/api/projects-models")
projects = response.json()["projects"]

# Get latest prompt for first project
if projects:
    project = projects[0]
    prompt_url = f"${baseUrl}/prompt/{project['name']}/{project['provider_id']}"
    prompt_response = requests.get(prompt_url)
    prompt_config = prompt_response.json()
    print(f"Latest prompt: {prompt_config['userPrompt']}")`}
                </CodeBlockCode>
              </CodeBlock>
            </div>

            {/* JavaScript Example */}
            <div>
              <Title headingLevel="h4" size="md">JavaScript Integration</Title>
              <CodeBlock>
                <CodeBlockCode>
{`// Get available projects
const projectsResponse = await fetch('${baseUrl}/api/projects-models');
const { projects } = await projectsResponse.json();

// Get latest prompt configuration
if (projects.length > 0) {
    const project = projects[0];
    const promptResponse = await fetch(
        \`${baseUrl}/prompt/\${project.name}/\${project.provider_id}\`
    );
    const promptConfig = await promptResponse.json();
    console.log('Latest prompt:', promptConfig.userPrompt);
}`}
                </CodeBlockCode>
              </CodeBlock>
            </div>
          </CardBody>
        </Card>

        {/* Use Cases */}
        <Card>
          <CardTitle>🎯 Common Use Cases</CardTitle>
          <CardBody>
            <List>
              <ListItem><strong>External Applications:</strong> Fetch latest tested prompts for your own applications</ListItem>
              <ListItem><strong>CI/CD Integration:</strong> Automate prompt deployment using the latest configurations</ListItem>
              <ListItem><strong>Model Serving:</strong> Use proven prompt templates in production systems</ListItem>
              <ListItem><strong>Analytics:</strong> Track prompt evolution and model performance across projects</ListItem>
              <ListItem><strong>Team Collaboration:</strong> Share prompt configurations across different tools and platforms</ListItem>
            </List>
          </CardBody>
        </Card>

        <Alert
          variant="info"
          title="Note"
          style={{ marginTop: '1.5rem' }}
        >
          All endpoints return JSON responses and support CORS for web applications. 
          Rate limiting and authentication may be added in future versions.
        </Alert>
      </ModalBody>

      <ModalFooter>
        <Button
          variant="primary"
          onClick={onClose}
        >
          Got it
        </Button>
        <Button
          variant="link"
          component="a"
          href={`${baseUrl}/docs`}
          target="_blank"
          icon={<ExternalLinkAltIcon />}
          iconPosition="right"
        >
          Open Full API Docs
        </Button>
      </ModalFooter>
    </Modal>
  );
};