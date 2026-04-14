import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VersionedTransaction } from "@solana/web3.js";
import { ArrowUpDown, CircleAlert, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { backendApi } from "@/lib/api";
import {
  base64ToBytes,
  bytesToBase64,
  getPhantomDetectionInfo,
  getPhantomProvider,
  shortenAddress,
  waitForPhantomProvider,
} from "@/lib/phantom";
import { clearStoredWalletSession, getStoredWalletSession, setStoredWalletSession } from "@/lib/wallet-session";
import type {
  WalletBalance,
  WalletSessionInfo,
  WalletSwapExecuteResponse,
  WalletSwapQuote,
  WalletSwapQuoteRequest,
  WalletTokenSymbol,
} from "@/types/api";

const TOKEN_OPTIONS: Array<{ symbol: WalletTokenSymbol; label: string }> = [
  { symbol: "SOL", label: "SOL" },
  { symbol: "USDC", label: "USDC" },
];

function formatTokenAmount(balance: WalletBalance | undefined): string {
  if (!balance) return "--";
  const parsed = Number(balance.amount);
  if (!Number.isFinite(parsed)) return balance.amount;
  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: balance.symbol === "SOL" ? 6 : 2,
  });
}

function formatQuoteAmount(amount: string, symbol: WalletTokenSymbol): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return `${amount} ${symbol}`;
  return `${parsed.toLocaleString(undefined, {
    maximumFractionDigits: symbol === "SOL" ? 6 : 2,
  })} ${symbol}`;
}

function sanitizeAmountInput(value: string): string {
  const sanitized = value.replace(/[^0-9.]/g, "");
  const parts = sanitized.split(".");
  if (parts.length <= 2) return sanitized;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function oppositeToken(symbol: WalletTokenSymbol): WalletTokenSymbol {
  return symbol === "SOL" ? "USDC" : "SOL";
}

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function WalletPage() {
  const queryClient = useQueryClient();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [walletSession, setWalletSession] = useState<WalletSessionInfo | null>(() => getStoredWalletSession());
  const [statusMessage, setStatusMessage] = useState<string>("Connect Phantom to begin.");
  const [quoteResult, setQuoteResult] = useState<WalletSwapQuote | null>(null);
  const [swapResult, setSwapResult] = useState<WalletSwapExecuteResponse | null>(null);
  const [phantomInfo, setPhantomInfo] = useState(() => getPhantomDetectionInfo());
  const [swapForm, setSwapForm] = useState<WalletSwapQuoteRequest>({
    fromSymbol: "SOL",
    toSymbol: "USDC",
    amount: "",
  });

  const phantomProvider = phantomInfo.provider;
  const phantomAvailable = Boolean(phantomProvider);
  const walletSignedIn = Boolean(walletSession?.token);
  const canQuote = walletSignedIn && swapForm.amount.trim().length > 0 && swapForm.fromSymbol !== swapForm.toSymbol;
  const connectedWalletMatchesSession =
    !walletSession?.address || !walletAddress || walletSession.address === walletAddress;

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let stopTimer: number | null = null;

    const refreshPhantomInfo = () => {
      if (cancelled) return;
      const next = getPhantomDetectionInfo();
      setPhantomInfo(next);
      if ((next.provider || next.requiresSecureContext) && pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshPhantomInfo();
      }
    };

    refreshPhantomInfo();
    pollTimer = window.setInterval(refreshPhantomInfo, 250);
    stopTimer = window.setTimeout(() => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 5_000);

    window.addEventListener("focus", refreshPhantomInfo);
    window.addEventListener("load", refreshPhantomInfo);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      if (stopTimer !== null) {
        window.clearTimeout(stopTimer);
      }
      window.removeEventListener("focus", refreshPhantomInfo);
      window.removeEventListener("load", refreshPhantomInfo);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!phantomProvider) return;

    phantomProvider
      .connect({ onlyIfTrusted: true })
      .then(({ publicKey }) => {
        const address = publicKey.toBase58();
        setWalletAddress(address);
        setStatusMessage(`Connected to ${shortenAddress(address)}.`);
      })
      .catch(() => {
        // Silent on first load. The user can connect explicitly.
      });
  }, [phantomProvider]);

  useEffect(() => {
    if (phantomAvailable || walletAddress || walletSession) {
      return;
    }
    if (!phantomInfo.requiresSecureContext) {
      return;
    }

    setStatusMessage(`Phantom requires HTTPS or localhost. Current origin: ${phantomInfo.origin}.`);
  }, [
    phantomAvailable,
    phantomInfo.origin,
    phantomInfo.requiresSecureContext,
    walletAddress,
    walletSession,
  ]);

  useEffect(() => {
    if (!walletSession) {
      clearStoredWalletSession();
      return;
    }
    setStoredWalletSession(walletSession);
  }, [walletSession]);

  useEffect(() => {
    setQuoteResult(null);
    setSwapResult(null);
  }, [swapForm.amount, swapForm.fromSymbol, swapForm.toSymbol]);

  useEffect(() => {
    if (!walletAddress || !walletSession || walletSession.address === walletAddress) {
      return;
    }

    clearStoredWalletSession();
    setWalletSession(null);
    setQuoteResult(null);
    setSwapResult(null);
    setStatusMessage("Connected wallet changed. Sign in again with the new wallet.");
  }, [walletAddress, walletSession]);

  const walletMeQuery = useQuery({
    queryKey: ["wallet-me", walletSession?.token],
    queryFn: () => backendApi.getWalletMe(walletSession!.token),
    enabled: Boolean(walletSession?.token),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (!walletMeQuery.isError) return;
    const message = getErrorMessage(walletMeQuery.error) ?? "";
    if (!/expired|unauthorized|invalid/i.test(message)) return;

    clearStoredWalletSession();
    setWalletSession(null);
    setStatusMessage("Wallet session expired. Sign in again.");
  }, [walletMeQuery.error, walletMeQuery.isError]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const provider = (await waitForPhantomProvider()) ?? getPhantomProvider();
      if (!provider) {
        const detection = getPhantomDetectionInfo();
        throw new Error(detection.unavailableReason ?? "Phantom was not detected in this browser.");
      }

      const { publicKey } = await provider.connect();
      return publicKey.toBase58();
    },
    onSuccess: (address) => {
      setWalletAddress(address);
      setStatusMessage(`Connected to ${shortenAddress(address)}.`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const provider = getPhantomProvider();
      if (!provider) return;
      await provider.disconnect();
    },
    onSuccess: () => {
      clearStoredWalletSession();
      setWalletSession(null);
      setWalletAddress("");
      setQuoteResult(null);
      setSwapResult(null);
      setStatusMessage("Wallet disconnected.");
    },
  });

  const signInMutation = useMutation({
    mutationFn: async () => {
      const provider = (await waitForPhantomProvider()) ?? getPhantomProvider();
      if (!provider) {
        const detection = getPhantomDetectionInfo();
        throw new Error(detection.unavailableReason ?? "Phantom was not detected in this browser.");
      }

      const address = walletAddress || provider.publicKey?.toBase58();
      if (!address) {
        throw new Error("Connect Phantom before signing in.");
      }

      const nonceResponse = await backendApi.createWalletNonce(address);
      const signedMessage = await provider.signMessage(new TextEncoder().encode(nonceResponse.message), "utf8");

      return backendApi.verifyWalletSignature({
        address,
        nonceId: nonceResponse.nonceId,
        message: nonceResponse.message,
        signatureBase64: bytesToBase64(signedMessage.signature),
      });
    },
    onSuccess: async (result) => {
      setWalletSession(result.session);
      setStatusMessage(`Wallet session ready for ${shortenAddress(result.session.address)}.`);
      await queryClient.invalidateQueries({ queryKey: ["wallet-me"] });
    },
  });

  const quoteMutation = useMutation({
    mutationFn: async () => {
      if (!walletSession?.token) {
        throw new Error("Sign in with your wallet before requesting a quote.");
      }

      return backendApi.getWalletSwapQuote(walletSession.token, swapForm);
    },
    onSuccess: (response) => {
      setQuoteResult(response.quote);
      setStatusMessage("Fresh Jupiter quote loaded.");
    },
  });

  const swapMutation = useMutation({
    mutationFn: async () => {
      const provider = (await waitForPhantomProvider()) ?? getPhantomProvider();
      if (!provider) {
        const detection = getPhantomDetectionInfo();
        throw new Error(detection.unavailableReason ?? "Phantom was not detected in this browser.");
      }
      if (!walletSession?.token) {
        throw new Error("Sign in with your wallet before swapping.");
      }
      if (!walletAddress || walletAddress !== walletSession.address) {
        throw new Error("Reconnect the same Phantom wallet you signed in with before swapping.");
      }

      const prepared = await backendApi.manualWalletSwapPrepare(walletSession.token, {
        action: "prepare",
        ...swapForm,
      });

      const transaction = VersionedTransaction.deserialize(base64ToBytes(prepared.transaction));
      const signedTransaction = await provider.signTransaction(transaction);
      const execution = await backendApi.manualWalletSwapExecute(walletSession.token, {
        action: "execute",
        requestId: prepared.requestId,
        signedTransaction: bytesToBase64(signedTransaction.serialize()),
      });

      return {
        prepared,
        execution,
      };
    },
    onSuccess: async ({ prepared, execution }) => {
      setQuoteResult(prepared.quote);
      setSwapResult(execution);
      setStatusMessage(
        execution.status === "Success"
          ? "Swap submitted through Jupiter."
          : execution.error || "Jupiter returned a non-success swap result."
      );
      await queryClient.invalidateQueries({ queryKey: ["wallet-me"] });
    },
  });

  const balances = walletMeQuery.data?.balances ?? [];
  const solBalance = balances.find((balance) => balance.symbol === "SOL");
  const usdcBalance = balances.find((balance) => balance.symbol === "USDC");
  const botWallet = walletMeQuery.data?.botWallet;

  const activeError =
    getErrorMessage(connectMutation.error) ||
    getErrorMessage(signInMutation.error) ||
    getErrorMessage(quoteMutation.error) ||
    getErrorMessage(swapMutation.error);

  const handleTokenChange = (field: "fromSymbol" | "toSymbol", nextSymbol: WalletTokenSymbol) => {
    setSwapForm((current) => {
      const next = {
        ...current,
        [field]: nextSymbol,
      };

      if (field === "fromSymbol" && next.fromSymbol === next.toSymbol) {
        next.toSymbol = oppositeToken(next.fromSymbol);
      }

      if (field === "toSymbol" && next.toSymbol === next.fromSymbol) {
        next.fromSymbol = oppositeToken(next.toSymbol);
      }

      return next;
    });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-mono font-semibold text-foreground md:text-xl">Wallet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Beginner-friendly Phantom auth, balances, and Jupiter swaps for SOL and USDC only.
        </p>
      </div>

      {!phantomAvailable ? (
        <Alert className="border-amber-500/30 bg-amber-500/10">
          <CircleAlert className="h-4 w-4 text-amber-300" />
          <AlertTitle>{phantomInfo.requiresSecureContext ? "Secure Origin Required" : "Phantom Not Detected"}</AlertTitle>
          <AlertDescription>
            {phantomInfo.requiresSecureContext
              ? `${phantomInfo.unavailableReason} Open the app through HTTPS or localhost, then reconnect.`
              : "Install or unlock Phantom in this browser, then refresh this tab. Private keys stay inside Phantom and are never sent to the backend."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Alert className="border-border bg-card">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle>Separate Wallets</AlertTitle>
        <AlertDescription>
          Phantom signs manual swaps in the browser. The bot wallet is separate and stays on the Pi. Do not reuse your Phantom seed for the bot.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono text-lg">
              <WalletIcon className="h-5 w-5 text-primary" />
              Phantom Session
            </CardTitle>
            <CardDescription>Connect once, then sign a backend nonce to unlock wallet routes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={phantomAvailable ? "default" : "secondary"}>
                {phantomAvailable ? "Phantom detected" : "Phantom missing"}
              </Badge>
              <Badge variant={walletAddress ? "default" : "secondary"}>
                {walletAddress ? "Connected" : "Not connected"}
              </Badge>
              <Badge variant={walletSignedIn ? "default" : "secondary"}>
                {walletSignedIn ? "Wallet session active" : "Sign-in required"}
              </Badge>
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Public Key</div>
              <div className="mt-2 break-all text-sm font-mono text-foreground">
                {walletAddress || walletSession?.address || "No wallet connected yet."}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{statusMessage}</div>
            </div>

            {!connectedWalletMatchesSession ? (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <CircleAlert className="h-4 w-4 text-amber-300" />
                <AlertTitle>Wallet Changed</AlertTitle>
                <AlertDescription>Reconnect and sign in again before requesting a quote or swap.</AlertDescription>
              </Alert>
            ) : null}

            {activeError ? (
              <Alert variant="destructive">
                <CircleAlert className="h-4 w-4" />
                <AlertTitle>Wallet Error</AlertTitle>
                <AlertDescription>{activeError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={!phantomAvailable || connectMutation.isPending}
              >
                {connectMutation.isPending ? "Connecting..." : "Connect Phantom"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => signInMutation.mutate()}
                disabled={!phantomAvailable || !walletAddress || signInMutation.isPending}
              >
                {signInMutation.isPending ? "Signing..." : "Sign in with wallet"}
              </Button>
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={!walletAddress || disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-mono text-lg">Balances</CardTitle>
            <CardDescription>Balances are fetched on the backend from your configured Solana RPC.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">SOL</div>
                <div className="mt-2 text-2xl font-mono font-semibold text-foreground">
                  {walletMeQuery.isPending ? "--" : formatTokenAmount(solBalance)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">USDC</div>
                <div className="mt-2 text-2xl font-mono font-semibold text-foreground">
                  {walletMeQuery.isPending ? "--" : formatTokenAmount(usdcBalance)}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Bot Wallet</div>
              <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                <div>{botWallet?.note ?? "Bot wallet status becomes available after wallet sign-in."}</div>
                {botWallet?.configured && botWallet.address ? (
                  <div className="mt-2 font-mono text-foreground">{shortenAddress(botWallet.address, 6)}</div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-mono text-lg">
            <ArrowUpDown className="h-5 w-5 text-primary" />
            Manual Swap
          </CardTitle>
          <CardDescription>
            Only SOL to USDC and USDC to SOL are supported in v1. The transaction is signed in Phantom before execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">From</div>
              <Select
                value={swapForm.fromSymbol}
                onValueChange={(value) => handleTokenChange("fromSymbol", value as WalletTokenSymbol)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose token" />
                </SelectTrigger>
                <SelectContent>
                  {TOKEN_OPTIONS.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      {token.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end justify-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="border border-border"
                onClick={() =>
                  setSwapForm((current) => ({
                    ...current,
                    fromSymbol: current.toSymbol,
                    toSymbol: current.fromSymbol,
                  }))
                }
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">To</div>
              <Select
                value={swapForm.toSymbol}
                onValueChange={(value) => handleTokenChange("toSymbol", value as WalletTokenSymbol)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose token" />
                </SelectTrigger>
                <SelectContent>
                  {TOKEN_OPTIONS.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      {token.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Amount</div>
              <Input
                inputMode="decimal"
                placeholder={swapForm.fromSymbol === "SOL" ? "0.10" : "25"}
                value={swapForm.amount}
                onChange={(event) =>
                  setSwapForm((current) => ({
                    ...current,
                    amount: sanitizeAmountInput(event.target.value),
                  }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => quoteMutation.mutate()} disabled={!canQuote || quoteMutation.isPending}>
              {quoteMutation.isPending ? "Getting quote..." : "Quote"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => swapMutation.mutate()}
              disabled={!canQuote || !quoteResult || swapMutation.isPending}
            >
              {swapMutation.isPending ? "Preparing swap..." : "Swap"}
            </Button>
          </div>

          {quoteResult ? (
            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Latest Quote</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">You send</div>
                  <div className="mt-1 text-sm font-mono text-foreground">
                    {formatQuoteAmount(quoteResult.amount, quoteResult.fromSymbol)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">You receive</div>
                  <div className="mt-1 text-sm font-mono text-foreground">
                    {formatQuoteAmount(quoteResult.expectedOutputAmount, quoteResult.toSymbol)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Price impact</div>
                  <div className="mt-1 text-sm font-mono text-foreground">{quoteResult.priceImpactPct}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Route</div>
                  <div className="mt-1 text-sm font-mono text-foreground">{quoteResult.routeLabel}</div>
                </div>
              </div>
            </div>
          ) : null}

          {swapResult ? (
            <div className="rounded-lg border border-border bg-secondary/20 p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Last Swap Result</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={swapResult.status === "Success" ? "default" : "destructive"}>
                  {swapResult.status}
                </Badge>
                {swapResult.signature ? <Badge variant="outline">{shortenAddress(swapResult.signature, 6)}</Badge> : null}
              </div>
              {swapResult.explorerUrl ? (
                <a
                  href={swapResult.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm text-primary underline-offset-4 hover:underline"
                >
                  Open transaction
                </a>
              ) : null}
              {swapResult.error ? <div className="mt-3 text-sm text-negative">{swapResult.error}</div> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
