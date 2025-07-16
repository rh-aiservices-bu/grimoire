import { render, screen } from '@testing-library/react';
import { ProjectList } from './ProjectList';
import { Project } from '../../types';

const mockProjects: Project[] = [
  {
    id: 1,
    name: 'Test Project',
    llamastack_url: 'http://localhost:8000',
    provider_id: 'test-provider',
    git_repo_url: 'https://github.com/test/repo',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
];

describe('ProjectList', () => {
  it('renders create new project button', () => {
    render(
      <ProjectList
        projects={mockProjects}
        onSelectProject={() => {}}
        onCreateNew={() => {}}
      />
    );

    expect(screen.getByText('Create New Project')).toBeInTheDocument();
  });

  it('renders project cards', () => {
    render(
      <ProjectList
        projects={mockProjects}
        onSelectProject={() => {}}
        onCreateNew={() => {}}
      />
    );

    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });
});