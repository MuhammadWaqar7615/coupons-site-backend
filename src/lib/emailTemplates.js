export const emailTemplateDefaults = [
  {
    templateKey: "new-user-registered",
    title: "New User Registered (Welcome Email)",
    subject: "Welcome to CodiceSconto",
    message: "Hello {{name}},\n\nWelcome to CodiceSconto. Your account has been created successfully.\n\nYou can sign in with {{email}}.",
  },
  {
    templateKey: "forgot-password-reset-link",
    title: "Forgot Password - Reset Link",
    subject: "Reset your password",
    message: "Hello {{name}},\n\nUse the link below to reset your password:\n{{resetLink}}\n\nThis link will expire soon.",
  },
  {
    templateKey: "password-reset-confirmation",
    title: "Password Reset - Confirmation",
    subject: "Your password has been reset",
    message: "Hello {{name}},\n\nYour CodiceSconto password was reset successfully. If you did not make this change, please contact support.",
  },
];
