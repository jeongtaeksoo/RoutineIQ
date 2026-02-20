import * as React from "react";
import { X, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShareCardProps {
    isOpen: boolean;
    onClose: () => void;
    stats: {
        streak: number;
        focusTime: number;
        blocks: number;
        date: string;
    };
}

export function ShareCard({ isOpen, onClose, stats }: ShareCardProps) {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-sm overflow-hidden rounded-[var(--radius-panel)] bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 z-10 rounded-full bg-black/10 p-2 text-black/70 hover:bg-black/20"
                >
                    <X className="h-5 w-5" />
                </button>

                {/* Card Content (This is the part to screenshot) */}
                <div className="relative flex aspect-[9/16] w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-orange-100 via-white to-rose-100 p-8 text-center">
                    {/* Decorative circles */}
                    <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-orange-300/20 blur-3xl" />
                    <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-rose-300/20 blur-3xl" />

                    <div className="relative z-10">
                        <p className="font-serif text-lg text-muted-foreground mb-1">{stats.date}</p>
                        <h2 className="title-serif text-3xl font-bold text-foreground mb-8">My RutineIQ</h2>

                        <div className="space-y-6">
                            <div className="rounded-2xl bg-white/60 p-6 backdrop-blur-sm shadow-sm ring-1 ring-white/50">
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Current Streak</p>
                                <p className="mt-1 text-5xl font-bold text-orange-500">{stats.streak} <span className="text-2xl">days</span></p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-2xl bg-white/60 p-4 backdrop-blur-sm shadow-sm ring-1 ring-white/50">
                                    <p className="text-xs font-medium text-muted-foreground uppercase">Focus</p>
                                    <p className="mt-1 text-xl font-bold text-foreground">{stats.focusTime}m</p>
                                </div>
                                <div className="rounded-2xl bg-white/60 p-4 backdrop-blur-sm shadow-sm ring-1 ring-white/50">
                                    <p className="text-xs font-medium text-muted-foreground uppercase">Blocks</p>
                                    <p className="mt-1 text-xl font-bold text-foreground">{stats.blocks}</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10">
                            <p className="text-sm font-medium text-muted-foreground">&quot;Small routines, big changes.&quot;</p>
                        </div>
                    </div>

                    {/* Footer Logo */}
                    <div className="absolute bottom-6 left-0 right-0 text-center">
                        <span className="font-serif text-sm font-semibold text-foreground/40">RutineIQ.com</span>
                    </div>
                </div>

                {/* Action Bar */}
                <div className="flex gap-2 p-4 bg-white border-t">
                    <Button className="flex-1 rounded-full" onClick={() => onClose()}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                    </Button>
                    <Button variant="outline" className="flex-1 rounded-full" onClick={() => onClose()}>
                        <Download className="mr-2 h-4 w-4" />
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}
