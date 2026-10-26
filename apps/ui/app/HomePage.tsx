"use client";
import { requestAdmission } from "@/lib/admission/client";
import type { AdmissionState } from "@/lib/admission/contract";
import { PendingAdmission } from "@/components/admission/PendingAdmission";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { TrainingLibraryShell } from "@/components/navigation/TrainingLibraryShell";
import { DevDatabaseWarning } from "@/components/DevDatabaseWarning";
import { TrainingBootstrapShell } from "@/components/training/pilot/TrainingBootstrapShell";
import {
  detectOnboardingLanguage,
  getStoredOnboardingLanguage,
  isOnboardingLanguage,
  setOnboardingLanguage,
  type OnboardingLanguage,
} from "@/lib/onboardingI18n";
import { fetchUserPreferences } from "@/lib/trainingService";
import {
  createTrainingTransitionId,
  measureTrainingTransitionStage,
  recordTrainingTransitionTiming,
} from "@/lib/training/trainingTransitionTiming";
import type { TrainingStartupSnapshot } from "@/lib/training/trainingStartupSnapshot";

import {readAcceptJournal,tabAcceptStore} from '@/lib/collections/sharing/acceptJournal';
import {forgetShareInvitation,readPendingShareInvitation,rememberAccountSharePreview,readAccountSharePreview,forgetAccountSharePreview} from '@/lib/collections/sharing/shareInvitationIntake';
export default function HomePage({invitationCode}:{invitationCode?:string|null}={}) {
  const [admission, setAdmission] = useState<AdmissionState | null>(null);
  const [pendingInvitation,setPendingInvitation]=useState<string|null>(process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true'?invitationCode??null:null);
  useEffect(()=>{if(process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED!=='true')return;try{setPendingInvitation(invitationCode===undefined?readPendingShareInvitation(window.sessionStorage):invitationCode);}catch{}},[invitationCode]);
  const [intakeOwner,setIntakeOwner]=useState<string|null>(null);
  const [recoveredInvitation,setRecoveredInvitation]=useState<{userId:string;code:string}|null>(null);
  const [user, setUser] = useState<User | null>(null);
  const clearInvitation=useCallback(()=>{setPendingInvitation(null);setIntakeOwner(null);setRecoveredInvitation(null);try{forgetShareInvitation(window.sessionStorage);if(user)forgetAccountSharePreview(window.sessionStorage,user.id);}catch{}},[user]);
  useEffect(()=>{if(!user||process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED!=='true'){setRecoveredInvitation(null);return;}const pending=readAcceptJournal(tabAcceptStore(),user.id);let code=pending?.command.action==='accept'?pending.command.code:null;try{if(invitationCode===null)forgetAccountSharePreview(window.sessionStorage,user.id);if(!pendingInvitation&&invitationCode!==null)code??=readAccountSharePreview(window.sessionStorage,user.id);}catch{}setRecoveredInvitation(code?{userId:user.id,code}:null);},[user,pendingInvitation,invitationCode]);
  useEffect(()=>{if(user&&pendingInvitation&&!intakeOwner){setIntakeOwner(user.id);try{rememberAccountSharePreview(window.sessionStorage,user.id,pendingInvitation);forgetShareInvitation(window.sessionStorage);}catch{}}},[user,pendingInvitation,intakeOwner]);
  const [bootstrapStatus, setBootstrapStatus] = useState<
    "loading" | "long-running" | "error" | "ready"
  >("loading");
  const [activeTransitionId, setActiveTransitionId] = useState(
    createTrainingTransitionId,
  );
  const [interfaceLanguage, setInterfaceLanguage] =
    useState<OnboardingLanguage>("en");
  const [interfaceLanguageReady, setInterfaceLanguageReady] = useState(false);
  const [browserLanguageResolved, setBrowserLanguageResolved] = useState(false);
  const [startupSnapshot, setStartupSnapshot] =
    useState<TrainingStartupSnapshot | null>(null);
  const initialTransitionIdRef = useRef(activeTransitionId);
  const initialAuthRequestStartedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const requestedUserIdRef = useRef<string | null | undefined>(undefined);
  const bootstrapRequestRef = useRef(0);

  const loadSession = useCallback((transitionId: string) => {
    const requestId = bootstrapRequestRef.current + 1;
    bootstrapRequestRef.current = requestId;
    requestedUserIdRef.current = undefined;
    setActiveTransitionId(transitionId);
    setBootstrapStatus("loading");
    setAdmission(null);
    void measureTrainingTransitionStage(
      transitionId,
      "auth.session",
      () => supabase.auth.getSession(),
      ({ data }) => (data?.session?.user ? "authenticated" : "anonymous"),
    )
      .then(async ({ data }) => {
        if (bootstrapRequestRef.current !== requestId) return;
        const authenticatedUser = data?.session?.user ?? null;
        requestedUserIdRef.current = authenticatedUser?.id ?? null;
        if (!authenticatedUser) {
          currentUserIdRef.current = null;
          setUser(null);
          setStartupSnapshot(null);
          setBootstrapStatus("ready");
          return;
        }

        const access = await requestAdmission(data.session?.access_token ?? "");
        if (bootstrapRequestRef.current !== requestId) return;
        setAdmission(access);
        if (access.status !== "approved") {
          currentUserIdRef.current = authenticatedUser.id; setUser(authenticatedUser); setStartupSnapshot(null); setBootstrapStatus("ready"); return;
        }
        const browserLanguage = getStoredOnboardingLanguage();
        const preferences = await measureTrainingTransitionStage(
          transitionId,
          "training.preferences",
          () => fetchUserPreferences(authenticatedUser.id),
        );
        if (bootstrapRequestRef.current !== requestId) return;
        const rawAccountLanguage = preferences.preferences.onboardingLanguage;
        const accountLanguage = isOnboardingLanguage(rawAccountLanguage)
          ? rawAccountLanguage
          : null;
        const resolvedLanguage =
          accountLanguage ??
          browserLanguage ??
          detectOnboardingLanguage(preferences.translationLang);
        setOnboardingLanguage(resolvedLanguage);
        setInterfaceLanguage(resolvedLanguage);
        setInterfaceLanguageReady(true);
        setStartupSnapshot({
          transitionId,
          interfaceLanguage: resolvedLanguage,
          preferences,
        });
        currentUserIdRef.current = authenticatedUser.id;
        setUser(authenticatedUser);
        setBootstrapStatus("ready");
      })
      .catch(() => {
        if (bootstrapRequestRef.current !== requestId) return;
        setBootstrapStatus("error");
      });
  }, []);

  useEffect(() => {
    const storedLanguage = getStoredOnboardingLanguage();
    const initialLanguage = storedLanguage ?? detectOnboardingLanguage();
    setInterfaceLanguage(initialLanguage);
    // A global browser-language guess is not account-specific. Keep this
    // first frame language-neutral unless it is backed by a saved hint; the
    // accessible progress label remains available until account preferences
    // become authoritative.
    setInterfaceLanguageReady(Boolean(storedLanguage));
    setBrowserLanguageResolved(true);
    recordTrainingTransitionTiming({
      transitionId: activeTransitionId,
      stage: "training.interface-language",
      durationMs: 0,
      outcome: storedLanguage ? `local-${storedLanguage}` : "local-missing",
    });
  }, [activeTransitionId]);

  useEffect(() => {
    if (bootstrapStatus !== "loading") return;
    const timeout = window.setTimeout(() => {
      setBootstrapStatus((current) =>
        current === "loading" ? "long-running" : current,
      );
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [bootstrapStatus]);

  useEffect(() => {
    if (!browserLanguageResolved) return;
    if (!initialAuthRequestStartedRef.current) {
      initialAuthRequestStartedRef.current = true;
      loadSession(initialTransitionIdRef.current);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      // getSession() above owns the initial read. Supabase also emits the same
      // state when the listener is registered; treating that as a change would
      // duplicate or repeatedly restart bootstrap.
      if (event === "INITIAL_SESSION") return;
      const nextUserId = session?.user?.id ?? null;
      if (requestedUserIdRef.current === undefined) {
        loadSession(createTrainingTransitionId());
        return;
      }
      const knownUserId =
        requestedUserIdRef.current ?? currentUserIdRef.current;
      if (nextUserId === knownUserId) return;
      loadSession(createTrainingTransitionId());
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [browserLanguageResolved, loadSession]);

  if (bootstrapStatus !== "ready") {
    return (
      <TrainingBootstrapShell
        interfaceLanguage={interfaceLanguage}
        interfaceLanguageReady={interfaceLanguageReady}
        status={bootstrapStatus}
        onRetry={() => loadSession(createTrainingTransitionId())}
      />
    );
  }

  if (user && admission && admission.status !== "approved") return <PendingAdmission state={admission} language={interfaceLanguage} onRetry={() => loadSession(createTrainingTransitionId())} onSignOut={() => { void supabase.auth.signOut().then(() => loadSession(createTrainingTransitionId())); }} />;

  if (!user || !startupSnapshot) {
    return <AuthScreen />;
  }

  return (
    <>
      <DevDatabaseWarning />
      <TrainingLibraryShell
        key={user.id}
        user={user}
        startupSnapshot={startupSnapshot}
        invitationCode={recoveredInvitation?.userId===user.id?recoveredInvitation.code:intakeOwner===user.id?pendingInvitation:null}
        onInvitationConsumed={clearInvitation}
      />
    </>
  );
}
