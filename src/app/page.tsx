import "@/styles/landing.css";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowRight,
  GitBranch,
  Search,
  Users,
  Terminal,
  Cpu,
  ShieldCheck,
} from "lucide-react";

export default async function LandingPage() {
  const { userId } = await auth();

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="landing-header">
        <div className="container-tech landing-header-inner">
          <div className="landing-logo">
            <div className="logo-square" />
            Queryn
          </div>
          <nav className="landing-nav">
            <a href="#features" className="landing-nav-link">
              Features
            </a>
            <a href="#process" className="landing-nav-link">
              Process
            </a>
            <a href="#pricing" className="landing-nav-link">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-4">
            {userId ? (
               <Link href="/dashboard" className="btn-tech-primary">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="landing-nav-link hidden sm:block">
                  Log In
                </Link>
                <Link href="/sign-in" className="btn-tech-primary">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="container-tech">
          <div className="hero-grid">
            <div className="hero-content">
              <div className="hero-badge">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                Beta
                <span className="mx-2 text-zinc-600">|</span>
                <span className="text-zinc-500">v0.9.2</span>
              </div>
              <h1 className="hero-title">
                AI-powered insights <br />
                for your GitHub repos
              </h1>
              <p className="hero-subtitle">
                Turn your repositories into an intelligent knowledge base.
                Queryn indexes your code, tracks commits, and helps teams
                ship faster with AI-powered insights.
              </p>
              <div className="hero-actions">
                <Link href="/sign-in" className="btn-tech-primary">
                  Start Building
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="https://github.com/satvikydv/queryn"
                  target="_blank"
                  className="btn-tech-secondary"
                >
                  <GitBranch className="size-4" />
                  View on GitHub
                </a>
              </div>
            </div>
            <div className="hero-image-wrapper">
              <div className="hero-image-frame aspect-video relative">
                <Image
                  src="/assets/queryn2.png"
                  alt="Queryn Dashboard Interface"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features" id="features">
        <div className="container-tech">
          <span className="section-label">System Modules</span>
          <h2 className="section-title">Engineered for Developers</h2>
          
          <div className="bento-grid">
            {/* Main Feature - AI Analysis */}
            <div className="bento-card bento-span-2">
              <div className="bento-icon">
                <Terminal className="size-5" />
              </div>
              <h3 className="bento-title">Deep Code Analysis</h3>
              <p className="bento-desc">
                Gemini-powered semantic search across your entire repository.
                Ask complex questions about architecture, dependencies, and logic flow.
              </p>
              <div className="bento-visual">
                <div className="code-window">
                  <span className="code-line text-sm text-zinc-500 mb-2">// Semantic Query: &quot;How does auth work?&quot;</span>
                  <span className="code-line"><span className="code-purple">const</span> analyze = <span className="code-blue">async</span> (repo) ={">"} {"{"}</span>
                  <span className="code-line pl-4"><span className="code-purple">const</span> context = <span className="code-blue">await</span> db.index(repo);</span>
                  <span className="code-line pl-4"><span className="code-green">return</span> ai.generateResponse(context);</span>
                  <span className="code-line">{"}"}</span>
                </div>
              </div>
            </div>

            {/* Feature 2 - Commit Tracking */}
            <div className="bento-card">
              <div className="bento-icon">
                <GitBranch className="size-5" />
              </div>
              <h3 className="bento-title">Smart Commits</h3>
              <p className="bento-desc">
                Automated changelogs and commit summaries. Understand 
                the &quot;why&quot; behind every change without reading diffs.
              </p>
            </div>

            {/* Feature 3 - Team Q&A */}
            <div className="bento-card">
              <div className="bento-icon">
                <Users className="size-5" />
              </div>
              <h3 className="bento-title">Knowledge Base</h3>
              <p className="bento-desc">
                Persist answers to common questions. Build a living documentation 
                that updates automatically as code changes.
              </p>
            </div>

            {/* Feature 4 - Security/Privacy */}
            <div className="bento-card bento-span-2">
              <div className="bento-icon">
                <ShieldCheck className="size-5" />
              </div>
              <h3 className="bento-title">Enterprise Security</h3>
              <p className="bento-desc">
                Your code never leaves the secure execution environment. 
                SOC2 compliant infrastructure with role-based access control.
              </p>
              <div className="bento-visual !bg-transparent border-none flex items-center gap-4 pt-4">
                 <div className="h-2 w-full bg-zinc-800 rounded overflow-hidden">
                    <div className="h-full bg-white w-3/4"></div>
                 </div>
                 <span className="font-mono text-xs">ENCRYPTED</span>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="landing-process" id="process">
        <div className="container-tech">
          <span className="section-label">Workflow</span>
          <h2 className="section-title">Initialization Sequence</h2>
          
          <div className="process-steps">
            <div className="process-step">
              <div className="process-number">01</div>
              <h3 className="bento-title">Connect Repository</h3>
              <p className="bento-desc">
                Link your GitHub account. Select private or public repositories
                for indexing.
              </p>
            </div>
            
            <div className="process-step">
              <div className="process-number">02</div>
              <h3 className="bento-title">Index Generation</h3>
              <p className="bento-desc">
                System parses structure, dependencies, and logic flows to build
                a semantic graph.
              </p>
            </div>
            
            <div className="process-step">
              <div className="process-number">03</div>
              <h3 className="bento-title">Query & Execute</h3>
              <p className="bento-desc">
                Start asking questions via the terminal interface or web dashboard.
                Get instant answers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <div className="container-tech">
          <div className="cta-box">
             <div className="inline-block p-3 rounded-full bg-zinc-900 border border-zinc-800 mb-6">
                <Cpu className="size-6 text-white" />
             </div>
             <h2 className="section-title text-4xl mb-6">Ready to upgrade?</h2>
             <p className="bento-desc text-lg mb-8">
               Join developers shipping better code with Queryn.
               Start for free, scale as you grow.
             </p>
             <Link href="/sign-in" className="btn-tech-primary text-base px-6 py-3">
                Initialize Project
                <ArrowRight className="size-4" />
             </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container-tech">
          <div className="footer-inner">
             <div className="flex items-center gap-2">
                <div className="logo-square w-4 h-4"></div>
                <span className="font-mono font-bold">Queryn Systems</span>
             </div>
             <div className="font-mono text-xs text-zinc-600">
               © {new Date().getFullYear()} / ALL RIGHTS RESERVED
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
