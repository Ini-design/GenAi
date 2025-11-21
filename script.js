   // --- Configuration and Environment Setup ---//
    const apiKey = "";
    const modelName = 'gemini-2.5-flash-preview-09-2025';
    const apiUrlBase = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const generateButton = document.getElementById('generate-button');
    const buttonText = document.getElementById('button-text');
    const loadingIndicator = document.getElementById('loading-indicator');
    const responseContainer = document.getElementById('response-container');
    const citationContainer = document.getElementById('citation-container');
    const citationsDiv = document.getElementById('citations');
    const structuredCheckbox = document.getElementById('structured-output');
    const jsonSchemaDisplay = document.getElementById('json-schema-display');

    // Sample JSON Schema for structured output lab
    const structuredSchema = {
        type: "OBJECT",
        properties: {
            reasoning_steps: { type: "ARRAY", items: { type: "STRING" } },
            final_summary: { type: "STRING" },
            confidence_score: { type: "NUMBER", description: "Score from 0 to 100." }
        },
        propertyOrdering: ["reasoning_steps", "final_summary", "confidence_score"]
    };

    // Toggle JSON schema visibility when checkbox changes
    structuredCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            jsonSchemaDisplay.classList.remove('hidden');
            // If structured, force no grounding as the schema overrides the tool
            document.getElementById('google-grounding').checked = false;
        } else {
            jsonSchemaDisplay.classList.add('hidden');
        }
    });

    document.getElementById('google-grounding').addEventListener('change', (e) => {
        if (e.target.checked) {
            // If grounding, force no structured output
            structuredCheckbox.checked = false;
            jsonSchemaDisplay.classList.add('hidden');
        }
    });


    // --- Core API Interaction Logic ---

    function setUILoading(isLoading) {
        generateButton.disabled = isLoading;
        if (isLoading) {
            buttonText.textContent = 'Generating...';
            loadingIndicator.classList.remove('hidden');
            responseContainer.innerHTML = `<div class="loading-spinner"></div> <span class="ml-2">Thinking...</span>`;
            citationContainer.classList.add('hidden');
        } else {
            buttonText.textContent = 'Generate Response';
            loadingIndicator.classList.add('hidden');
        }
    }

    async function generateResponse(userQuery, systemPrompt, isGrounded, isStructured) {
        let payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        if (isGrounded) {
            payload.tools = [{ "google_search": {} }];
        }

        if (isStructured) {
             // Forcing structured output requires specific config
             payload.generationConfig = {
                responseMimeType: "application/json",
                responseSchema: structuredSchema
             };
             // Note: Structured generation overrides search grounding
        }

        let retryCount = 0;
        const maxRetries = 5;

        while (retryCount < maxRetries) {
            try {
                const response = await fetch(apiUrlBase, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                const candidate = result.candidates?.[0];

                if (!candidate) {
                    throw new Error("No candidates returned by the model.");
                }

                const textPart = candidate.content?.parts?.[0];
                if (!textPart || !textPart.text) {
                    throw new Error("Generated text content is missing.");
                }

                let text = textPart.text;
                let sources = [];

                // 2. Extract grounding sources
                const groundingMetadata = candidate.groundingMetadata;
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title,
                        }))
                        .filter(source => source.uri && source.title);
                }

                return { text, sources };

            } catch (error) {
                console.error(`Attempt ${retryCount + 1} failed:`, error);
                retryCount++;
                if (retryCount >= maxRetries) {
                    throw new Error("Max retries reached. Failed to generate content.");
                }
                // Exponential backoff: 2^retryCount seconds
                const delay = Math.pow(2, retryCount) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    function displayResult(text, sources, isStructured) {
        citationsDiv.innerHTML = '';
        citationContainer.classList.add('hidden');

        if (isStructured) {
            // Display JSON in a pretty, code-block format
            try {
                const jsonObject = JSON.parse(text);
                const formattedJson = JSON.stringify(jsonObject, null, 2);
                responseContainer.innerHTML = `<pre class="code-block">${formattedJson["final_summary"]}</pre>`;
            } catch (e) {
                responseContainer.innerHTML = `<p class="text-red-600 font-bold">Error parsing JSON output. Raw Text:</p><p class="whitespace-pre-wrap">${text}</p>`;
            }
        } else {
            // Display standard markdown text
            // Simple markdown to HTML conversion for readability
            let htmlText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            htmlText = htmlText.replace(/### (.*)/g, '<h3>$1</h3>');
            htmlText = htmlText.replace(/## (.*)/g, '<h2>$1</h2>');
            htmlText = htmlText.replace(/\n/g, '<br>');
            responseContainer.innerHTML = `<p>${htmlText}</p>`;
        }


        if (sources && sources.length > 0) {
            citationContainer.classList.remove('hidden');
            sources.forEach((source, index) => {
                const link = document.createElement('a');
                link.href = source.uri;
                link.target = "_blank";
                link.className = "text-primary hover:underline block truncate";
                link.textContent = `${index + 1}. ${source.title}`;
                citationsDiv.appendChild(link);
            });
        }
    }

    // --- Event Handler ---
    window.handleFormSubmit = async (event) => {
        event.preventDefault();
        const userQuery = document.getElementById('user-query').value.trim();
        const systemPrompt = document.getElementById('system-instruction').value.trim();
        const isGrounded = document.getElementById('google-grounding').checked;
        const isStructured = document.getElementById('structured-output').checked;

        if (!userQuery) {
            responseContainer.innerHTML = '<p class="text-red-500">Please enter a user query.</p>';
            return;
        }

        setUILoading(true);

        try {
            const { text, sources } = await generateResponse(userQuery, systemPrompt, isGrounded, isStructured);
            displayResult(text, sources, isStructured);
        } catch (error) {
            console.error("Critical Generation Error:", error);
            responseContainer.innerHTML = `<p class="text-red-500">Generation failed: ${error.message}. Check the console for details.</p>`;
        } finally {
            setUILoading(false);
        }
    };

