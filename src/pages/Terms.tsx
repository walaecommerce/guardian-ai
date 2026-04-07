const Terms = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto prose prose-sm dark:prose-invert">
        <h1 className="text-2xl font-bold text-foreground mb-6">Terms of Service</h1>
        <p className="text-muted-foreground mb-4">Last updated: April 7, 2026</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground">By accessing or using Amazon Listing Guardian, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">2. Description of Service</h2>
        <p className="text-muted-foreground">Amazon Listing Guardian provides AI-powered image compliance analysis for Amazon product listings, including automated issue detection, image generation, and reporting tools.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">3. User Accounts</h2>
        <p className="text-muted-foreground">You are responsible for maintaining the security of your account credentials. You must provide accurate information during registration.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">4. Usage Credits</h2>
        <p className="text-muted-foreground">The service operates on a credit-based system. Free accounts receive a limited number of credits. Additional credits are available through paid subscription plans. Credits are non-transferable and non-refundable.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">5. Intellectual Property</h2>
        <p className="text-muted-foreground">You retain ownership of all images you upload. AI-generated images are provided for your use in Amazon product listings. We do not claim ownership of generated content.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">6. Limitation of Liability</h2>
        <p className="text-muted-foreground">The service is provided "as is." We do not guarantee that AI-generated images will meet Amazon's requirements in all cases. You are responsible for verifying compliance before uploading to Amazon.</p>

        <h2 className="text-lg font-semibold text-foreground mt-6 mb-3">7. Termination</h2>
        <p className="text-muted-foreground">We reserve the right to suspend or terminate accounts that violate these terms or engage in abusive behavior.</p>
      </div>
    </div>
  );
};

export default Terms;
