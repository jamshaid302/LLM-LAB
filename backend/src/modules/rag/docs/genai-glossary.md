# Generative AI glossary

This file is part of the lab's shared knowledge base, so learners can ask the RAG page about
these terms.

## Token

A token is the unit a language model reads and writes. In English one token is about four
characters, or roughly three quarters of a word. Models are priced and limited by tokens,
not by words.

## Context window

The context window is the maximum number of tokens a model can see at once, counting the
system message, the conversation, retrieved documents, and the answer it writes. Text past
the window is cut off, which is why long chats are summarized.

## Temperature

Temperature controls how random the next token is. A temperature of 0 always picks the
most likely token, which suits factual answers and evaluation. Higher values such as 0.8
give more varied wording and suit brainstorming.

## Top-p

Top-p, also called nucleus sampling, keeps only the smallest set of tokens whose
probabilities add up to p, then samples from that set. A top-p of 0.9 drops the long tail
of unlikely tokens.

## Embedding

An embedding is a list of numbers that represents the meaning of a piece of text. Texts
with similar meaning get vectors that point in a similar direction. This lab embeds text
with the nomic-embed-text model.

## Cosine similarity

Cosine similarity measures the angle between two embedding vectors. A score of 1 means the
same direction and 0 means unrelated. This lab drops retrieved chunks that score under the
0.5 cutoff.

## Chunking

Chunking splits a long document into smaller pieces before embedding. This lab uses chunks
of about 400 characters with a 50-character overlap, so a sentence cut at a boundary still
appears whole in one of the two neighbouring chunks.

## Bi-encoder and cross-encoder

A bi-encoder embeds the question and each chunk separately, which is fast and is how vector
search works. A cross-encoder reads the question and one chunk together and outputs a
relevance score, which is slower but more accurate, so it is used to rerank a short list.

## BM25 and hybrid search

BM25 is a keyword ranking formula that rewards rare words that appear in both the question
and the chunk. Hybrid search runs BM25 and vector search and merges the two lists with
reciprocal rank fusion, which adds 1 divided by 60 plus the rank from each list.

## Recall at k and MRR

Recall at k is the share of questions whose correct chunk appears in the top k results.
Mean reciprocal rank (MRR) averages 1 divided by the rank of the first correct chunk, so a
correct chunk at rank 2 scores 0.5.

## Hallucination and grounding

A hallucination is a fluent answer that is not supported by the sources. Grounding means
the answer only uses facts from the retrieved documents, and a grounded system says it
does not know when the documents do not contain the answer.

## Prompt injection

Prompt injection is text inside a document or user message that tries to override the
system instructions, such as "ignore previous instructions". Retrieved text should be
treated as data, never as instructions.

## LLM as a judge

An LLM judge is a second model call that grades an answer, for example by answering yes or
no to whether it contains a labelled fact. A judge must itself be checked against human
labels before its scores are trusted.

## Fine-tuning and LoRA

Fine-tuning continues training a model on your own examples to change its style or
behaviour. LoRA trains small low-rank adapter matrices instead of all the weights, and
QLoRA does the same on a 4-bit quantized model to save memory. RAG is usually tried first
because it adds knowledge without retraining.

## Agent and tool calling

An agent is a loop where the model chooses a tool, the program runs it, and the result is
sent back until the model gives a final answer. The ReAct pattern alternates reasoning and
actions, and the loop needs a step limit so it cannot run forever.
