import type { IFieldExtractionProvider, ExtractedFields, FieldDefinition } from '@constractor/types';

export class MockFieldExtractionProvider implements IFieldExtractionProvider {
  async extractFields(_text: string, _fields: FieldDefinition[], _language?: string): Promise<ExtractedFields> {
    return {};
  }
}
