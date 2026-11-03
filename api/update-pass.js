// api/update-pass.js - Vercel Serverless Function to update pass and push to GitHub
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};

// Helper: Convert URL or raw string to Base64 data URL
async function ensureBase64(input, defaultMime = 'image/jpeg') {
  if (!input || typeof input !== 'string') return input;
  const trimmed = input.trim();
  
  // Already a base64 data URL
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  
  // If it's an HTTP/HTTPS image URL, fetch and convert to base64
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const response = await fetch(trimmed);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || defaultMime;
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return `data:${contentType};base64,${base64}`;
      }
    } catch (e) {
      console.error('Failed to convert remote image URL to base64:', e.message);
    }
  }

  // If raw base64 string without data prefix
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:${defaultMime};base64,${trimmed}`;
  }

  return trimmed;
}

// Helper: Helper to commit any file directly to GitHub Repository
async function commitToGitHub({ token, repo, branch = 'main', filePath, contentString, commitMessage }) {
  const cleanRepo = repo
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();

  const fileContentBase64 = Buffer.from(contentString, 'utf8').toString('base64');

  // 1. Fetch existing file SHA
  const getFileUrl = `https://api.github.com/repos/${cleanRepo}/contents/${filePath}?ref=${branch}`;
  const getFileRes = await fetch(getFileUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Pass-Updater'
    }
  });

  let currentSha = null;
  if (getFileRes.ok) {
    const fileInfo = await getFileRes.json();
    currentSha = fileInfo.sha;
  } else if (getFileRes.status !== 404) {
    const errJson = await getFileRes.json().catch(() => ({}));
    throw new Error(`GitHub Query Error (${getFileRes.status}): ${errJson.message || getFileRes.statusText}`);
  }

  // 2. Put / Commit the file
  const putFileUrl = `https://api.github.com/repos/${cleanRepo}/contents/${filePath}`;
  const putPayload = {
    message: commitMessage,
    content: fileContentBase64,
    branch: branch
  };

  if (currentSha) {
    putPayload.sha = currentSha;
  }

  const putRes = await fetch(putFileUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Vercel-Pass-Updater'
    },
    body: JSON.stringify(putPayload)
  });

  const putData = await putRes.json().catch(() => ({}));
  if (!putRes.ok) {
    throw new Error(`GitHub Commit Error (${putRes.status}): ${putData.message || 'Failed to commit file'}`);
  }

  return putData;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password, x-github-token, x-github-repo');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const fs = await import('fs');
  const path = await import('path');

  // Read config.json for zero-environment variable support
  const configPath = path.join(process.cwd(), 'data', 'config.json');
  let appConfig = {
    adminPassword: 'admin',
    githubRepo: '',
    branch: 'main',
    isConfigured: false
  };

  try {
    if (fs.existsSync(configPath)) {
      const rawConfig = fs.readFileSync(configPath, 'utf8');
      appConfig = { ...appConfig, ...JSON.parse(rawConfig) };
    }
  } catch (e) {
    console.warn('Could not read config.json, using defaults:', e.message);
  }

  // Expected password hierarchy: ENV VAR > config.json > 'admin'
  const expectedPassword = process.env.ADMIN_PASSWORD || appConfig.adminPassword || 'admin';

  // ==========================================
  // GET: Return current pass data & config status
  // ==========================================
  if (req.method === 'GET') {
    try {
      const passPath = path.join(process.cwd(), 'data', 'pass.json');
      let passData = {};
      if (fs.existsSync(passPath)) {
        passData = JSON.parse(fs.readFileSync(passPath, 'utf8'));
      }

      return res.status(200).json({
        success: true,
        data: passData,
        hasEnvToken: Boolean(process.env.GITHUB_TOKEN),
        hasEnvRepo: Boolean(process.env.GITHUB_REPO),
        hasCustomPassword: Boolean(process.env.ADMIN_PASSWORD || (appConfig.adminPassword && appConfig.adminPassword !== 'admin')),
        githubRepo: process.env.GITHUB_REPO || appConfig.githubRepo || '',
        branch: process.env.GITHUB_BRANCH || appConfig.branch || 'main',
        isConfigured: Boolean(process.env.GITHUB_TOKEN || appConfig.isConfigured || appConfig.githubRepo)
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==========================================
  // POST: Verify, change password, or update pass
  // ==========================================
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const providedPassword = body.password || body.currentPassword || req.headers['x-admin-password'];

      // Action 1: Verify Password Only
      if (body.action === 'verify-password') {
        if (providedPassword === expectedPassword) {
          return res.status(200).json({
            success: true,
            message: 'Password verified',
            isConfigured: Boolean(process.env.GITHUB_TOKEN || appConfig.isConfigured || appConfig.githubRepo)
          });
        } else {
          return res.status(401).json({
            success: false,
            error: 'Incorrect Admin Password. (Default is: admin)'
          });
        }
      }

      // Action 2: Change Admin Password
      if (body.action === 'change-password') {
        if (providedPassword !== expectedPassword) {
          return res.status(401).json({
            success: false,
            error: 'Current admin password is incorrect.'
          });
        }

        const newPassword = (body.newPassword || '').trim();
        if (!newPassword || newPassword.length < 3) {
          return res.status(400).json({
            success: false,
            error: 'New password must be at least 3 characters long.'
          });
        }

        // Update config
        const updatedConfig = {
          ...appConfig,
          adminPassword: newPassword,
          isConfigured: true
        };

        if (body.githubRepo) updatedConfig.githubRepo = body.githubRepo.trim();
        if (body.branch) updatedConfig.branch = body.branch.trim();

        // Try writing locally if allowed
        try {
          fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
        } catch (e) {
          // In read-only serverless this might throw, which is expected
        }

        // Check if GitHub credentials available to commit new config
        const token = process.env.GITHUB_TOKEN || body.githubToken || req.headers['x-github-token'];
        const repo = process.env.GITHUB_REPO || body.githubRepo || updatedConfig.githubRepo;
        const branch = process.env.GITHUB_BRANCH || body.branch || updatedConfig.branch || 'main';

        let commitUrl = null;
        if (token && repo) {
          try {
            const putRes = await commitToGitHub({
              token,
              repo,
              branch,
              filePath: 'data/config.json',
              contentString: JSON.stringify(updatedConfig, null, 2),
              commitMessage: 'Update admin password & portal configuration [auto-deploy]'
            });
            commitUrl = putRes.commit?.html_url || null;
          } catch (commitErr) {
            console.error('Failed to commit config.json to GitHub:', commitErr);
            return res.status(200).json({
              success: true,
              warning: `Password changed for this session, but failed to commit to GitHub: ${commitErr.message}. Make sure GitHub token and repository are correct.`
            });
          }
        }

        return res.status(200).json({
          success: true,
          message: commitUrl
            ? 'Admin password updated and committed to GitHub! Vercel is auto-deploying the new password.'
            : 'Admin password updated! Note: To save permanently across deployments, ensure GitHub Token and Repo are configured.',
          commit: commitUrl
        });
      }

      // Action 3: Pass Update (Requires valid password)
      if (providedPassword !== expectedPassword) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid Admin Password'
        });
      }

      const {
        busPassNo,
        validFrom,
        validTo,
        userPhoto,
        signature,
        qrCode,
        name,
        route,
        githubToken: clientToken,
        githubRepo: clientRepo,
        branch: clientBranch
      } = body;

      // Resolve GitHub Credentials from ENV or client body / headers / config.json
      const token = process.env.GITHUB_TOKEN || clientToken || req.headers['x-github-token'];
      const repo = process.env.GITHUB_REPO || clientRepo || appConfig.githubRepo || req.headers['x-github-repo'];
      const branch = process.env.GITHUB_BRANCH || clientBranch || appConfig.branch || 'main';

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Missing GitHub Token. Please enter your GitHub Personal Access Token in the admin form or setup prompt.'
        });
      }

      if (!repo) {
        return res.status(400).json({
          success: false,
          error: 'Missing GitHub Repository (e.g. username/repo-name). Please enter your GitHub repository name in the admin form or setup prompt.'
        });
      }

      // Auto-convert any image format/URL to Base64
      const [finalUserPhoto, finalSignature, finalQrCode] = await Promise.all([
        ensureBase64(userPhoto, 'image/jpeg'),
        ensureBase64(signature, 'image/png'),
        ensureBase64(qrCode, 'image/png')
      ]);

      // Prepare the new pass JSON payload
      const newPassData = {
        name: name || 'GOPAL',
        route: route || 'Student All route AC/Non AC',
        busPassNo: busPassNo || '7502122518771',
        validFrom: validFrom || '11/12/2025',
        validTo: validTo || '10/01/2026',
        userPhoto: finalUserPhoto || '',
        signature: finalSignature || '',
        qrCode: finalQrCode || ''
      };

      // Commit to GitHub repository
      const fileContentStr = JSON.stringify(newPassData, null, 2);
      const commitRes = await commitToGitHub({
        token,
        repo,
        branch,
        filePath: 'data/pass.json',
        contentString: fileContentStr,
        commitMessage: `Update bus pass #${newPassData.busPassNo} [auto-deploy]`
      });

      // Also, if repo was updated and not in config.json yet, attempt to commit config.json as well
      if (clientRepo && clientRepo !== appConfig.githubRepo) {
        try {
          const updatedConfig = { ...appConfig, githubRepo: clientRepo, branch: branch, isConfigured: true };
          await commitToGitHub({
            token,
            repo,
            branch,
            filePath: 'data/config.json',
            contentString: JSON.stringify(updatedConfig, null, 2),
            commitMessage: 'Save GitHub repository configuration [auto-deploy]'
          });
        } catch (e) {
          console.warn('Non-fatal: could not auto-commit config.json:', e.message);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Pass updated with base64 images and committed to GitHub! Vercel is now automatically rebuilding and deploying.',
        commit: commitRes.commit?.html_url || null,
        data: newPassData
      });
    } catch (err) {
      console.error('Update error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Internal Server Error'
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
