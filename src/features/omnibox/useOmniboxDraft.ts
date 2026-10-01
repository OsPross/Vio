import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

export type UseOmniboxDraftArgs = {
  activeUrl: string | undefined;
  activeId: string | undefined;
  isHome: boolean;
  isTorHome: boolean;
  isInternalAbout: boolean;
};

export type UseOmniboxDraftResult = {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  omniEditingRef: MutableRefObject<boolean>;
  omniFocusedRef: MutableRefObject<boolean>;
};

export function useOmniboxDraft({
  activeUrl,
  activeId,
  isHome,
  isTorHome,
  isInternalAbout,
}: UseOmniboxDraftArgs): UseOmniboxDraftResult {
  const [draft, setDraft] = useState(isHome || isTorHome ? '' : (activeUrl ?? ''));
  /** Omnibox: user is editing — ignore navigations / tab URL sync for draft */
  const omniEditingRef = useRef(false);
  const omniFocusedRef = useRef(false);

  useEffect(() => {
    if (omniEditingRef.current && omniFocusedRef.current) return;
    if (isHome || isTorHome || isInternalAbout) setDraft('');
    else setDraft(activeUrl ?? '');
  }, [activeId, activeUrl, isHome, isTorHome, isInternalAbout]);

  return { draft, setDraft, omniEditingRef, omniFocusedRef };
}
