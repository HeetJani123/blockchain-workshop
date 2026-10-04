import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'x402 Lab — Agent payment sandbox', description: 'Watch an AI agent navigate HTTP 402, evaluate a budget, and pay for data in an interactive simulation.', icons: { icon: '/favicon.svg' } };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
