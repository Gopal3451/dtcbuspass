# DTC e-Bus Pass — Zero-Config Auto-Deploy Portal

> **Ready for Saif:** Deploy on Vercel with **ZERO environment variables**! The admin page automatically prompts you for your GitHub setup on first visit, and allows you to change your admin password directly from the web interface.

---

## ⚡ Quick Start for Saif (3 Steps)

### 1️⃣ Push this folder to your own GitHub
1. Open terminal / command prompt in this folder (`Desktop\saif`):
   ```bash
   git init
   git add .
   git commit -m "Initial commit for DTC Pass Portal"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
   git push -u origin main
   ```
   *(You can make the repository **Public** or **Private** — both work completely!)*

---

### 2️⃣ Deploy to Vercel (NO Environment Variables Needed!)
1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **"Add New..."** &rarr; **"Project"**.
3. Import your new GitHub repository.
4. **DO NOT enter any environment variables!** Just click **"Deploy"**.
5. Vercel will build and deploy your site in ~30 seconds.

---

### 3️⃣ First-Time Admin Login & Automatic Setup
1. Open your deployed site's admin URL:
   ```
   https://your-project.vercel.app/admin
   ```
2. Log in using the default admin password:
   ```
   admin
   ```
3. **The Quick Setup modal will automatically appear on your screen!**
   It will ask you for:
   - **GitHub Repository**: e.g. `your-username/your-repo`
   - **GitHub Personal Access Token**: 
     - Click the 1-click link: [Create Token on GitHub](https://github.com/settings/tokens/new?scopes=repo&description=DTC-Pass-Updater)
     - Make sure the **`repo`** scope is checked.
     - Paste your `ghp_...` token.
   - **Change Admin Password (Optional)**:
     - Enter your new custom admin password (or keep default `admin`).
4. Click **"Test Connection"** &rarr; **"Save & Finish Setup"**.
5. Done! Your credentials are saved securely in your browser.

---

## 🔐 How to Change Admin Password Anytime

You do **NOT** need to edit Vercel settings or redeploy manually to change your password:

1. Open `/admin` and log in.
2. Click the **"⚙️ Settings & Password"** button in the top navigation bar.
3. Under the **"🔐 Admin Password"** tab:
   - Enter your **Current Password**.
   - Enter your **New Password** and confirm it.
   - Click **"Update Password & Redeploy"**.
4. The system will:
   - Automatically commit your new password to `data/config.json` in your GitHub repository.
   - Vercel will automatically detect the commit and redeploy in ~20 seconds.
   - Keep you logged in without interrupting your workflow.

---

## 🎫 How to Update Pass & Deploy Live

1. Go to `/admin`.
2. Edit:
   - **Bus Pass Number**
   - **Passenger Name**
   - **Route / Category**
   - **Valid From & Valid To dates**
3. Upload new:
   - **User Photo** (automatically converted to clean Base64)
   - **Signature Image** (automatically converted to clean Base64)
   - **QR Code Image** (upload or click **"Auto-Generate QR"**)
4. Check the **Real-Time Live Preview** on the right side of the screen.
5. Click **"Save & Automatically Deploy to Vercel"**.
6. That's it! Changes are pushed directly to GitHub, and Vercel updates your live pass at `https://your-project.vercel.app/` within seconds.
