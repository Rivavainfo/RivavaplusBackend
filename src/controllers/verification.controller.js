const VerificationService = require('../services/verification.service');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');

class VerificationController {
  /**
   * POST /api/v1/verification/send-email
   */
  static sendVerificationEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const uid = req.user ? req.user.uid : req.body.uid;

    if (!uid) {
      throw ApiError.badRequest('User ID is required.');
    }
    if (!email) {
      throw ApiError.badRequest('Email address is required.');
    }

    const result = await VerificationService.sendVerificationEmail(uid, email);
    return ApiResponse.ok(res, result, 'Verification email sent successfully.');
  });

  /**
   * GET /api/v1/verification/verify or GET /verify?token=...
   */
  static verifyToken = asyncHandler(async (req, res) => {
    const token = req.query.token;
    const isHtmlRequest = req.accepts('html') && !req.accepts('json');

    const result = await VerificationService.verifyToken(token);

    if (req.query.format === 'json' || !isHtmlRequest) {
      return ApiResponse.ok(res, result, result.message);
    }

    const appPackage = 'com.rivavafi.universal';
    const appDeepLink = `rivava://verify?token=${token}&uid=${result.uid || ''}`;
    const intentLink = `intent://verify?token=${token}&uid=${result.uid || ''}#Intent;scheme=rivava;package=${appPackage};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

    // Render minimalistic Material 3 dark theme verification success screen
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="refresh" content="1; url=${intentLink}">
          <title>Email Approved - Rivava</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; }
            body {
              background: radial-gradient(circle at top center, #1E293B 0%, #0B0F19 100%);
              color: #F8FAFC;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 24px 16px;
            }
            .card {
              background: rgba(30, 41, 59, 0.75);
              backdrop-filter: blur(20px);
              -webkit-backdrop-filter: blur(20px);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 28px;
              padding: 44px 32px;
              max-width: 460px;
              width: 100%;
              box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 30px rgba(56, 189, 248, 0.15);
              text-align: center;
            }
            .checkmark-wrap {
              width: 80px;
              height: 80px;
              background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.1));
              border: 2px solid rgba(34, 197, 94, 0.4);
              border-radius: 50%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 24px;
              box-shadow: 0 10px 25px rgba(34, 197, 94, 0.25);
              animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .checkmark-icon {
              font-size: 40px;
            }
            h1 {
              font-size: 26px;
              font-weight: 800;
              color: #FFFFFF;
              letter-spacing: -0.5px;
              margin-bottom: 10px;
            }
            .subtext {
              font-size: 15px;
              color: #94A3B8;
              line-height: 1.6;
              margin-bottom: 28px;
            }
            .setup-text {
              font-size: 14px;
              font-weight: 600;
              color: #38BDF8;
              margin-bottom: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            }
            .spinner {
              width: 16px;
              height: 16px;
              border: 2px solid rgba(56, 189, 248, 0.3);
              border-top-color: #38BDF8;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
            }
            .app-btn {
              display: inline-block;
              width: 100%;
              background: linear-gradient(135deg, #2563EB, #1D4ED8);
              color: #FFFFFF;
              text-decoration: none;
              padding: 16px 24px;
              border-radius: 14px;
              font-size: 16px;
              font-weight: 700;
              box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35);
              transition: transform 0.2s, background 0.2s;
            }
            .app-btn:hover {
              transform: translateY(-2px);
              background: linear-gradient(135deg, #3B82F6, #2563EB);
            }
            @keyframes popIn {
              0% { transform: scale(0); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="checkmark-wrap">
              <span class="checkmark-icon">✅</span>
            </div>
            <h1>Email Approved!</h1>
            <p class="subtext">Your email address has been successfully verified. Welcome to Rivava!</p>
            <div class="setup-text">
              <div class="spinner"></div>
              <span>Setting up your account…</span>
            </div>
            <a href="${intentLink}" class="app-btn" id="openAppBtn">Open Rivava App &rarr;</a>
          </div>

          <script>
            if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
              setTimeout(function() {
                try {
                  window.location.href = "${intentLink}";
                } catch(e) {
                  window.location.href = "${appDeepLink}";
                }
              }, 600);
            }
          </script>
        </body>
      </html>
    `);
  });

  /**
   * GET /api/v1/verification/status?uid=...
   */
  static checkStatus = asyncHandler(async (req, res) => {
    const uid = req.query.uid || (req.user && req.user.uid);
    const status = await VerificationService.checkStatus(uid);
    return ApiResponse.ok(res, status, 'Verification status retrieved.');
  });
}

module.exports = VerificationController;
