export type WorkLogTextInput = {
  description: string;
  legalArea?: string | null;
};

export async function improveWorkLogText(input: WorkLogTextInput) {
  void input;

  return {
    enabled: false,
    text: null,
  };
}
