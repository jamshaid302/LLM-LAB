# Learning guide

This guide is for the Conversations chat and the RAG page. Each section answers one learner question. An answer should explain the idea, then name the lab page in the section.

## What is generative AI?

What is generative AI? Generative AI creates new text, and sometimes images or audio, instead of only returning a stored sentence. A large language model is the part that writes the text. This lab teaches that stack from tokens, through RAG, to agents. Open the Learning Path page and start at the top.

## What is an LLM?

What is an LLM, and how does a large language model work? An LLM reads tokens, not whole words, and predicts the next token. Temperature 0 always picks the most likely token. A higher temperature varies the wording. The context window is the most tokens the model can see at once. Open LLM Fundamentals, run the Precise preset twice, then the Creative preset twice.

## What is RAG?

What is RAG? Retrieval-augmented generation searches your own documents, then gives the best passages to the language model with the question. The model answers from those passages. RAG does not retrain the model. In this lab it does not search the internet. Open the RAG page and ask where the company gym is, then read the sources under the answer.

## How does RAG work?

How does RAG work? Documents are split into chunks of about 400 characters. Each chunk is embedded and stored. The question is embedded too. A cross-encoder rescores the nearest chunks, and a chunk under a cosine score of 0.5 is dropped. The model then answers from what remains. Open Advanced RAG and click Compare retrieval.

## How can I learn RAG?

How can I learn RAG? Use this order. Read the RAG stage on the Learning Path page. On the RAG page, ask a question and inspect the sources. On Advanced RAG, compare the retrievers. On LLM Evaluation, click Score question set. Return to Conversations and ask about any step that is still unclear.

## Concepts behind generative AI

What are the concepts and technologies behind generative AI? Learn them in this order: how a language model works, prompting, retrieval-augmented generation, chat and memory, measuring quality, agents, and running the system for real users. Fine-tuning and multimodal models are explained on the Learning Path page and are not built yet. Ask this chat what one of those concepts means.
