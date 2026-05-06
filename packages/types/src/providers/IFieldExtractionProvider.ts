export type FieldDefinitionType = 'string' | 'enum';

export interface FieldDefinition {
  name: string;
  description: string;
  type: FieldDefinitionType;
  options?: string[];
}

export interface ExtractedFields {
  [fieldName: string]: string | undefined;
}

export interface IFieldExtractionProvider {
  extractFields(text: string, fields: FieldDefinition[], language?: string): Promise<ExtractedFields>;
}
