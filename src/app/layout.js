export const metadata = {
  title: "CodiceSconto Backend Service",
  description: "Unified API and Data Service for CodiceSconto Ecosystem",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
