import { useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/auth/token-storage';
import { apiRequest } from '@/lib/api-client';

export type FieldDefinitionType = 'string' | 'enum';

export interface FieldDefinition {
  name: string;
  description: string;
  type: FieldDefinitionType;
  options?: string[];
}

export type ExtractedFields = Record<string, string | undefined>;

export function useFieldExtraction() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = useCallback(async (
    text: string,
    fields: FieldDefinition[],
  ): Promise<ExtractedFields> => {
    setIsExtracting(true);
    try {
      const token = await getAccessToken();
      return await apiRequest<ExtractedFields>('/ai/extract-fields', {
        method: 'POST',
        body: { text, fields },
        token: token ?? undefined,
      });
    } catch {
      return {};
    } finally {
      setIsExtracting(false);
    }
  }, []);

  return { isExtracting, extract };
}
