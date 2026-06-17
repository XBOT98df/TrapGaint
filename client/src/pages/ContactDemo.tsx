import { SecureMessageGateway } from "@/components/ui/secure-message-gateway";

export default function ContactDemo() {
  return (
    <div className="min-h-screen w-full bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2">Secure Message Gateway</h1>
          <p className="text-muted-foreground">Contact form with card background design</p>
        </div>
        
        <SecureMessageGateway />
      </div>
    </div>
  );
}
