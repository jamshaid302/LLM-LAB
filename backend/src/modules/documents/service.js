/**
 * The document pipeline page. The RAG service still owns the files and the embed
 * queue. This module only checks the request and calls the functions it was given.
 */
export function createDocumentPipelineService({
  listDocuments,
  documentStatus,
  acceptDocument,
  retryDocument,
  removeDocument,
}) {
  async function list(userId) {
    const documents = await listDocuments(userId);
    return Promise.all(
      documents.map(async (document) => {
        const job = await documentStatus(document.name, userId);
        return {
          name: document.name,
          shared: document.shared,
          removable: document.removable,
          status: job.status,
          chunks: job.chunks,
          error: job.error,
        };
      }),
    );
  }

  return {
    list,
    status: documentStatus,
    accept: acceptDocument,
    retry: retryDocument,
    remove: removeDocument,
  };
}
