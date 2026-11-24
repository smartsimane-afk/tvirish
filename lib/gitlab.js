// Store backed by a GitLab repository. Every commit triggers a new Vercel deployment.
export function gitlabStore({ token, project, branch = 'main', baseUrl = 'https://gitlab.com' }) {
  const base = `${baseUrl.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(project)}`;

  async function gl(path, options = {}) {
    const res = await fetch(base + path, {
      ...options,
      headers: {
        'PRIVATE-TOKEN': token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.status === 404 && options.allow404) return null;
    if (!res.ok) throw new Error(`GitLab ${options.method || 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
    return res;
  }

  return {
    async read(path) {
      const res = await gl(`/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(branch)}`, { allow404: true });
      return res ? res.text() : null;
    },

    async commit(message, changes) {
      const actions = changes.map((c) =>
        c.delete
          ? { action: 'delete', file_path: c.path }
          : { action: c.isNew ? 'create' : 'update', file_path: c.path, content: c.content, encoding: c.encoding === 'base64' ? 'base64' : 'text' });
      await gl('/repository/commits', {
        method: 'POST',
        body: JSON.stringify({ branch, commit_message: message, actions }),
      });
    },
  };
}
