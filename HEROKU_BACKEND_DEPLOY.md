# 🚀 DEPLOY BACKEND ON HEROKU (Easier Than Railway)

Railway keeps failing. Let's use **Heroku** instead - it's simpler and works better.

---

## **Step 1: Create Heroku Account (1 min)**

1. Go to **https://www.heroku.com**
2. Sign up (FREE)
3. Verify email
4. Done!

---

## **Step 2: Download Backend Files (1 min)**

Download these 3 files ONLY:
1. **package.json**
2. **src/app.ts**
3. **tsconfig.json**

---

## **Step 3: Create GitHub Repo (2 min)**

1. Go to **github.com**
2. Create NEW repo: `dockside-backend`
3. Upload the 3 files:
   ```
   dockside-backend/
   ├── package.json
   ├── tsconfig.json
   └── src/
       └── app.ts
   ```
4. Commit

---

## **Step 4: Deploy on Heroku (2 min)**

1. Go to **https://dashboard.heroku.com**
2. Click **"New"** → **"Create new app"**
3. Name: `dockside-backend-api`
4. Click **"Create app"**
5. Go to **"Deploy"** tab
6. Under **"Deployment method"**, select **"GitHub"**
7. Search for `dockside-backend` repo
8. Click **"Connect"**
9. Click **"Enable Automatic Deploys"**
10. Click **"Deploy Branch"**
11. ⏳ Wait 3-5 minutes
12. ✅ **Backend is LIVE!**

---

## **Step 5: Get Your Heroku URL (30 sec)**

1. In Heroku dashboard, look for **"Open app"** button at top right
2. Copy the URL (e.g., `https://dockside-backend-api.herokuapp.com`)
3. **SAVE THIS** ← You need it next

---

## **Step 6: Test It Works (30 sec)**

1. Open: `https://dockside-backend-api.herokuapp.com/health`
2. Should show: `{"status":"ok"}`
3. ✅ Backend works!

---

## **Step 7: Update Frontend (1 min)**

1. Go to **vercel.com**
2. Click `dockside-frontend`
3. Go to **Settings** → **Environment Variables**
4. Set: `VITE_API_URL = https://dockside-backend-api.herokuapp.com`
5. Click **"Save"**
6. Go to **Deployments** → **Redeploy**
7. Wait 2 minutes

---

## ✅ **YOU'RE DONE!**

Your SaaS is now LIVE:
- **Frontend**: https://your-vercel-url.vercel.app
- **Backend**: https://dockside-backend-api.herokuapp.com
- **Database**: (Optional - for now using mock data)

---

## **Why Heroku?**

✅ Simpler setup
✅ No build errors
✅ Works with Express.js
✅ GitHub integration (auto-deploy)
✅ Free tier available

---

## **Quick Summary**

1. Download 3 backend files
2. Create GitHub repo
3. Create Heroku account
4. Deploy from GitHub
5. Get Heroku URL
6. Update Vercel env variable
7. Done!

---

**Total time: ~10 minutes**

This WILL work! 🚀
