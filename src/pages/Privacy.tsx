const Privacy = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto prose prose-sm dark:prose-invert">
        <h1 className="text-2xl font-bold text-foreground mb-6">Privacy Policy</h1>
        <p className="text-muted-foreground mb-4">Last updated: April 7, 2026</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">1. Information We Collect</h2>
        <p className="text-muted-foreground">We collect information you provide directly, including your email address, name, and Amazon store URL when you create an account. We also collect product images you upload for analysis.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">2. How We Use Your Information</h2>
        <p className="text-muted-foreground">Your information is used to provide image compliance analysis, generate AI-powered fixes, track your audit history, and manage your subscription.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">3. Data Storage & Security</h2>
        <p className="text-muted-foreground">Your data is stored securely with row-level security policies ensuring only you can access your sessions, reports, and images. We use industry-standard encryption for data in transit and at rest.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">4. Data Retention</h2>
        <p className="text-muted-foreground">Your audit sessions and reports are retained for the duration of your account. You may delete individual sessions or reports at any time. Deleting your account removes all associated data.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">5. Third-Party Services</h2>
        <p className="text-muted-foreground">We use AI services (Google Gemini, OpenAI) to analyze and generate images. Images sent for analysis are processed according to each provider's data handling policies and are not stored by them beyond the request lifecycle.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">6. Contact</h2>
        <p className="text-muted-foreground">For privacy-related inquiries, please contact us through the application settings.</p>
      </div>
    </div>
  );
};

export default Privacy;
