function parseJSON(text, textLength, isDone) {
    if (isValidJson(text)) {
        return text
    } else if (!(typeof text === 'string' || text instanceof String)) {
        throw new Error(`Input Text has Unexpected Type of ${text?.constructor?.name || typeof text}`, { cause: JSON.stringify(text) })
    }

    let streamDone = isDone, wait = {},
        waitToFinishResolve,
        waitToFinish

    if (isDone) {
        waitToFinish = new Promise((r) => waitToFinishResolve = r)
    }

    return {
        isDone: () => {
            streamDone = streamDone || true
            wait.resolve?.();
            waitToFinishResolve?.()
        },
        addChunk: (chunk, isDone) => {
            text += chunk;
            streamDone = streamDone || isDone
            wait.resolve?.();
            if (streamDone) {
                waitToFinishResolve?.()
            }
        },
        value: new Promise(async (resolve) => {
            // Seeked First Character Below Before Parsing
            let at = -1;
            let ch = '';

            const maxByteSize = 32 * 1024; // Maximum byte 4MB size for each chunk
            let textProcessed = 0
            let garbageChunk = () => {
                if (at >= maxByteSize) {
                    // Add Processed Length
                    textProcessed += at
                    // Send Progress Info
                    let progress = (textProcessed / textLength) * 100 * 0.75
                    self.postMessage({ progress })
                    if (progress > 0.01) {
                        self.postMessage({ status: `${progress.toFixed(2)}% Importing User Data` })
                    }
                    // Garbage Processed Length
                    text = text.slice(at)
                    at = 0
                }
            }

            let waitForNextChunk = async () => {
                if (wait?.promise) {
                    await wait.promise
                } else {
                    wait.promise = new Promise((resolve) => {
                        wait.resolve = resolve
                    })
                    await wait.promise
                }
                wait = {}
            }

            let seekAsync = async (added = 1) => {
                // Get Next Chunk Until Available
                let newAt = at + added
                while (true) {
                    // Recheck new chunk in next position
                    ch = text.charAt(newAt);
                    if (ch) {
                        // Recheck if its white-space
                        if (ch <= ' ') {
                            newAt += 1
                            continue
                        }
                        // Next character found
                        at = newAt
                        garbageChunk();
                        break;
                    }
                    // If new character not found
                    // wait for chunk until its stream is done
                    if (streamDone) {
                        at = newAt
                        garbageChunk();
                        break;
                    }
                    await waitForNextChunk()
                }
            };

            let wordCheckAsync = async () => {
                let word = '';
                do {
                    word += ch;
                    await seekAsync();
                } while (ch.match(/[a-z]/i));
                return word;
            };

            let isPrimitive = true;
            let normalizeUnicodedStringAsync = async (quote) => {
                // Start Quote is Already Removed
                let inQuotes = '';
                let hasCompleteString = false;
                let startIndexNotIncluded = at
                let endIndexNotIncluded = 0;
                let slashCount = 0;
                let removedFirstQuote = false;
                // Find the end Quote
                while (quote) {
                    // Check series of indices as possible end quote
                    endIndexNotIncluded = text.indexOf(quote, startIndexNotIncluded + 1);
                    // If it is not found wait for next chunk
                    if (endIndexNotIncluded < 0) {
                        // If Stream is done 
                        // and End of Quote is not Found
                        // break it and run exception below
                        if (streamDone) break;
                        await waitForNextChunk()
                        continue
                    }
                    // Chch 
                    ch = text.charAt(endIndexNotIncluded - 1);
                    while (ch === '\\') {
                        slashCount++;
                        ch = text.charAt(endIndexNotIncluded - (slashCount + 1));
                    }
                    // If the slash behind the possible end quote is odd 
                    // Then it is included in the string
                    // So find the next possible end quote
                    if (!removedFirstQuote) {
                        removedFirstQuote = true;
                        startIndexNotIncluded += 1
                    }
                    if (slashCount % 2 !== 0) {
                        slashCount = 0;
                        // Get the string from last
                        inQuotes += text.substring(startIndexNotIncluded, endIndexNotIncluded)
                        startIndexNotIncluded = endIndexNotIncluded
                    } else {
                        if (isPrimitive) {
                            await waitToFinish
                            let nonWhiteSpace = /[^ ]*/g
                            const endOfStringIndex = endIndexNotIncluded + 2
                            nonWhiteSpace.lastIndex = endOfStringIndex
                            const match = nonWhiteSpace.exec(text)
                            const matchStr = match?.[0]
                            const errorIndex = match?.index;
                            if (matchStr && errorIndex >= endOfStringIndex) {
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            }
                            inQuotes += text.substring(startIndexNotIncluded, endIndexNotIncluded);
                            hasCompleteString = true
                        } else {
                            inQuotes += text.substring(startIndexNotIncluded, endIndexNotIncluded);
                            hasCompleteString = true
                            // Update character position
                            // Inside string +2 for outer quotes
                            await seekAsync(inQuotes.length + 2)
                        }
                        break;
                    }
                }

                if (hasCompleteString) {
                    // Parse other escapes inside the quote 
                    let stringifiedValue = `"${inQuotes}"`
                    return JSON.parse(stringifiedValue);
                } else {
                    throw error("Unterminated string in JSON")
                }
            };

            let seek = (added = 1) => {
                // Get Next Chunk Until Available
                let newAt = at + added
                while (true) {
                    // Recheck new chunk in next position
                    ch = text.charAt(newAt);
                    if (ch && ch <= ' ') {
                        newAt += 1
                        continue
                    }
                    at = newAt
                    garbageChunk();
                    break;
                }
            };

            let wordCheck = () => {
                let word = '';
                do {
                    word += ch;
                    seek();
                } while (ch.match(/[a-z]/i));
                return word;
            };

            let normalizeUnicodedString = (quote) => {
                // Start Quote is Already Removed
                let inQuotes = '';
                let hasCompleteString = false;
                let startIndexNotIncluded = at
                let endIndexNotIncluded = 0;
                let slashCount = 0;
                let removedFirstQuote = false;
                // Find the end Quote
                while (quote) {
                    // Check series of indices as possible end quote
                    endIndexNotIncluded = text.indexOf(quote, startIndexNotIncluded + 1);
                    // If it is not found wait for next chunk
                    if (endIndexNotIncluded < 0) {
                        // If Stream is done 
                        // and End of Quote is not Found
                        // break it and run exception below
                        break;
                    }
                    // Chch 
                    ch = text.charAt(endIndexNotIncluded - 1);
                    while (ch === '\\') {
                        slashCount++;
                        ch = text.charAt(endIndexNotIncluded - (slashCount + 1));
                    }
                    // If the slash behind the possible end quote is odd 
                    // Then it is included in the string
                    // So find the next possible end quote
                    if (!removedFirstQuote) {
                        removedFirstQuote = true;
                        startIndexNotIncluded += 1
                    }
                    if (slashCount % 2 !== 0) {
                        slashCount = 0;
                        // Get the string from last
                        inQuotes += text.substring(startIndexNotIncluded, endIndexNotIncluded)
                        startIndexNotIncluded = endIndexNotIncluded
                    } else {
                        if (isPrimitive) {
                            let nonWhiteSpace = /[^ ]*/g
                            const endOfStringIndex = endIndexNotIncluded + 2
                            nonWhiteSpace.lastIndex = endOfStringIndex
                            const match = nonWhiteSpace.exec(text)
                            const matchStr = match?.[0]
                            const errorIndex = match?.index;
                            if (matchStr && errorIndex >= endOfStringIndex) {
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            }
                            inQuotes += text.substring(startIndexNotIncluded, endIndexNotIncluded);
                            hasCompleteString = true
                        } else {
                            inQuotes += text.substring(startIndexNotIncluded, endIndexNotIncluded);
                            hasCompleteString = true
                            // Update character position
                            // Inside string +2 for outer quotes
                            seek(inQuotes.length + 2)
                        }
                        break;
                    }
                }

                if (hasCompleteString) {
                    // Parse other escapes inside the quote 
                    let stringifiedValue = `"${inQuotes}"`
                    return JSON.parse(stringifiedValue);
                } else {
                    throw error("Unterminated string in JSON")
                }
            };

            let error = (message, errorIndex) => {
                return new Error(`${message} at position ${errorIndex ?? at} (${text.charAt(errorIndex ?? at)})`, { cause: JSON.stringify(text) })
            }

            async function parseAsync() {
                // Find next non white space character
                let quote;
                let wordToFind
                let isFirstKey;
                switch (ch) {
                    case '{':
                        isPrimitive = false;
                        let returnObj = {};
                        await seekAsync()
                        if (ch === '}') {
                            await seekAsync()
                            return returnObj
                        } else if (ch !== `"`
                            // && ch !== `'` && ch !== "`"
                        ) {
                            // Not a Valid Key
                            throw error("Expected property name or '}' in JSON")
                        }
                        isFirstKey = true;
                        let lastCh
                        do {
                            if (isFirstKey) {
                                isFirstKey = false
                            } else if (ch === ',') {
                                lastCh = ch;
                                await seekAsync();
                            } else {
                                throw error("Expected ',' or '}' after property value in JSON")
                            }
                            // Get Key
                            let key = streamDone ? parse() : await parseAsync(); // Already Seeked Next Character
                            if (ch === ':') {
                                lastCh = ch;
                                await seekAsync();
                            } else {
                                throw error("Expected ':' after property name in JSON")
                            }
                            // Get Value
                            returnObj[key] = streamDone ? parse() : await parseAsync();; // Already Seeked Next Character
                            if (ch === '}') {
                                await seekAsync()
                                return returnObj
                            }
                        } while (ch === ',');
                        if (lastCh === ',') {
                            throw error("Expected double-quoted property name in JSON")
                        } else if (lastCh === ':') {
                            throw error("Unexpected end of JSON input")
                        } else if (jsonIsEmpty(returnObj)) {
                            throw error("Expected property name or '}' in JSON")
                        } else {
                            throw error("Expected ',' or '}' after property value in JSON")
                        }
                    case '[':
                        isPrimitive = false
                        let returnArr = [];
                        await seekAsync()
                        if (ch === ']') {
                            await seekAsync()
                            return returnArr
                        }
                        isFirstKey = true;
                        do {
                            if (isFirstKey) {
                                isFirstKey = false
                            } else if (ch === ',') {
                                await seekAsync();
                            } else {
                                throw error(returnArr.length ? "Expected ',' or ']' after array element" : "Unexpected end of JSON input");
                            }
                            // Get Value
                            let value = streamDone ? parse() : await parseAsync();; // Already Seeked Next Character
                            returnArr.push(value);
                            if (ch === ']') {
                                await seekAsync()
                                return returnArr
                            }
                        } while (ch === ',');
                        throw error(returnArr.length ? "Expected ',' or ']' after array element" : "Unexpected end of JSON input");
                    case '"':
                        // case "'":
                        // case '`':
                        // Get First Quote
                        quote = ch
                        if (text.length < 2) {
                            if (streamDone) {
                                throw error("Unterminated string in JSON")
                            } else {
                                await waitForNextChunk()
                            }
                        }
                        if (text.charAt(at + 1) === quote) {
                            if (isPrimitive) {
                                await waitToFinish
                                const endOfStringIndex = at + 2
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = endOfStringIndex
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= endOfStringIndex) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            } else {
                                // Update character position
                                // 2 Quotes
                                await seekAsync(2);
                            }
                            return '';
                        } else {
                            // normalizeUnicodedStringAsync function
                            // already updates character position
                            return await normalizeUnicodedStringAsync(quote);
                        }
                    case '0':
                    case '1':
                    case '2':
                    case '3':
                    case '4':
                    case '5':
                    case '6':
                    case '7':
                    case '8':
                    case '9':
                    case '-':
                        // case '.':
                        // case 'I':
                        // case '+':
                        let numHolder = ''
                        let addUpNumberStr = async () => {
                            numHolder += ch;
                            await seekAsync();
                        };

                        if (ch === '-' || ch === '+') {
                            await addUpNumberStr();
                        }
                        // if (ch === 'I') {
                        //     word = await wordCheckAsync();
                        //     wordToFind = 'Infinity'
                        //     if (word === wordToFind) {
                        //         if (isPrimitive) {
                        //             await waitToFinish
                        //             const indexAfterWord = at
                        //             let nonWhiteSpace = /[^ ]*/g
                        //             nonWhiteSpace.lastIndex = indexAfterWord
                        //             const match = nonWhiteSpace.exec(text)
                        //             const matchStr = match?.[0]
                        //             const errorIndex = match?.index;
                        //             if (matchStr && errorIndex >= indexAfterWord) {
                        //                 throw error("Unexpected non-whitespace character after JSON", errorIndex)
                        //             }
                        //         }
                        //         numHolder += word;
                        //     } else {
                        //         const numHolderLen = numHolder.length
                        //         const wordLen = word.length + numHolderLen
                        //         const wordToFindLen = wordToFind.length + numHolderLen
                        //         if (wordLen > wordToFindLen) {
                        //             const errorIndex = at - (wordLen - wordToFindLen);
                        //             throw error("Unexpected non-whitespace character after JSON", errorIndex)
                        //         } else {
                        //             const errorInWordIndex = at - 1;
                        //             throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                        //         }
                        //     }
                        // } else {
                        let afterDecimal = ch === '.'
                        let afterExponential
                        if (afterDecimal) {
                            await addUpNumberStr();
                        }
                        while (isFinite(ch) && ch !== '') {
                            await addUpNumberStr();
                            if (!afterDecimal && ch === '.') {
                                afterDecimal = true
                                await addUpNumberStr();
                            } else if (!afterExponential && (ch === 'e' || ch === 'E')) {
                                afterExponential = true
                                await addUpNumberStr();
                                if (ch === '+' || ch === '-') {
                                    await addUpNumberStr();
                                }
                            }
                        }
                        // }
                        const num = Number(numHolder);
                        if (isNaN(num)) {
                            const errorIndex = at - numHolder.length
                            throw error('Invalid Number', errorIndex);
                        } else {
                            if (isPrimitive) {
                                await waitToFinish
                                const indexAfterNumber = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterNumber
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterNumber) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return num;
                        }
                    case 't':
                        word = await wordCheckAsync();
                        wordToFind = 'true'
                        if (word === wordToFind) {
                            if (isPrimitive) {
                                await waitToFinish
                                const indexAfterWord = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterWord
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterWord) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return true
                        } else {
                            const wordLen = word.length
                            const wordToFindLen = wordToFind.length
                            if (wordLen > wordToFindLen) {
                                const errorIndex = at - (wordLen - wordToFindLen);
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            } else {
                                const errorInWordIndex = at - 1;
                                throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                            }
                        }
                    case 'f':
                        word = await wordCheckAsync();
                        wordToFind = 'false'
                        if (word === wordToFind) {
                            if (isPrimitive) {
                                await waitToFinish
                                const indexAfterWord = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterWord
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterWord) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return false
                        } else {
                            const wordLen = word.length
                            const wordToFindLen = wordToFind.length
                            if (wordLen > wordToFindLen) {
                                const errorIndex = at - (wordLen - wordToFindLen);
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            } else {
                                const errorInWordIndex = at - 1;
                                throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                            }
                        }
                    case 'n':
                        word = await wordCheckAsync();
                        wordToFind = 'null'
                        if (word === wordToFind) {
                            if (isPrimitive) {
                                await waitToFinish
                                const indexAfterWord = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterWord
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterWord) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return null
                        } else {
                            const wordLen = word.length
                            const wordToFindLen = wordToFind.length
                            if (wordLen > wordToFindLen) {
                                const errorIndex = at - (wordLen - wordToFindLen);
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            } else {
                                const errorInWordIndex = at - 1;
                                throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                            }
                        }
                    // case 'u':
                    //     word = await wordCheckAsync();
                    //     wordToFind = 'undefined'
                    //     if (word === wordToFind) {
                    //         if (isPrimitive) {
                    //             await waitToFinish
                    //             const indexAfterWord = at
                    //             let nonWhiteSpace = /[^ ]*/g
                    //             nonWhiteSpace.lastIndex = indexAfterWord
                    //             const match = nonWhiteSpace.exec(text)
                    //             const matchStr = match?.[0]
                    //             const errorIndex = match?.index;
                    //             if (matchStr && errorIndex >= indexAfterWord) {
                    //                 throw error("Unexpected non-whitespace character after JSON", errorIndex)
                    //             }
                    //         }
                    //         return undefined
                    //     } else {
                    //         const wordLen = word.length
                    //         const wordToFindLen = wordToFind.length
                    //         if (wordLen > wordToFindLen) {
                    //             const errorIndex = at - (wordLen - wordToFindLen);
                    //             throw error("Unexpected non-whitespace character after JSON", errorIndex)
                    //         } else {
                    //             const errorInWordIndex = at - 1;
                    //             throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                    //         }
                    //     }
                    default:
                        throw error('Unexpected Token');
                }
            }

            function parse() {
                // Find next non white space character
                let quote;
                let wordToFind
                let isFirstKey;
                switch (ch) {
                    case '{':
                        isPrimitive = false;
                        let returnObj = {};
                        seek()
                        if (ch === '}') {
                            seek()
                            return returnObj
                        } else if (ch !== `"`
                            // && ch !== `'` && ch !== "`"
                        ) {
                            // Not a Valid Key
                            throw error("Expected property name or '}' in JSON")
                        }
                        isFirstKey = true;
                        let lastCh
                        do {
                            if (isFirstKey) {
                                isFirstKey = false
                            } else if (ch === ',') {
                                lastCh = ch;
                                seek();
                            } else {
                                throw error("Expected ',' or '}' after property value in JSON")
                            }
                            // Get Key
                            let key = parse(); // Already Seeked Next Character
                            if (ch === ':') {
                                lastCh = ch;
                                seek();
                            } else {
                                throw error("Expected ':' after property name in JSON")
                            }
                            // Get Value
                            returnObj[key] = parse(); // Already Seeked Next Character
                            if (ch === '}') {
                                seek()
                                return returnObj
                            }
                        } while (ch === ',');
                        if (lastCh === ',') {
                            throw error("Expected double-quoted property name in JSON")
                        } else if (lastCh === ':') {
                            throw error("Unexpected end of JSON input")
                        } else if (jsonIsEmpty(returnObj)) {
                            throw error("Expected property name or '}' in JSON")
                        } else {
                            throw error("Expected ',' or '}' after property value in JSON")
                        }
                    case '[':
                        isPrimitive = false
                        let returnArr = [];
                        seek()
                        if (ch === ']') {
                            seek()
                            return returnArr
                        }
                        isFirstKey = true;
                        do {
                            if (isFirstKey) {
                                isFirstKey = false
                            } else if (ch === ',') {
                                seek();
                            } else {
                                throw error(returnArr.length ? "Expected ',' or ']' after array element" : "Unexpected end of JSON input");
                            }
                            // Get Value
                            let value = parse(); // Already Seeked Next Character
                            returnArr.push(value);
                            if (ch === ']') {
                                seek()
                                return returnArr
                            }
                        } while (ch === ',');
                        throw error(returnArr.length ? "Expected ',' or ']' after array element" : "Unexpected end of JSON input");
                    case '"':
                        // case "'":
                        // case '`':
                        // Get First Quote
                        quote = ch
                        if (text.length < 2) {
                            throw error("Unterminated string in JSON")
                        }
                        if (text.charAt(at + 1) === quote) {
                            if (isPrimitive) {
                                const endOfStringIndex = at + 2
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = endOfStringIndex
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= endOfStringIndex) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            } else {
                                // Update character position
                                // 2 Quotes
                                seek(2);
                            }
                            return '';
                        } else {
                            // normalizeUnicodedString function
                            // already updates character position
                            return normalizeUnicodedString(quote);
                        }
                    case '0':
                    case '1':
                    case '2':
                    case '3':
                    case '4':
                    case '5':
                    case '6':
                    case '7':
                    case '8':
                    case '9':
                    case '-':
                        // case '.':
                        // case 'I':
                        // case '+':
                        let numHolder = ''
                        let addUpNumberStr = () => {
                            numHolder += ch;
                            seek();
                        };

                        if (ch === '-' || ch === '+') {
                            addUpNumberStr();
                        }
                        // if (ch === 'I') {
                        //     word = wordCheck();
                        //     wordToFind = 'Infinity'
                        //     if (word === wordToFind) {
                        //         if (isPrimitive) {
                        //             const indexAfterWord = at
                        //             let nonWhiteSpace = /[^ ]*/g
                        //             nonWhiteSpace.lastIndex = indexAfterWord
                        //             const match = nonWhiteSpace.exec(text)
                        //             const matchStr = match?.[0]
                        //             const errorIndex = match?.index;
                        //             if (matchStr && errorIndex >= indexAfterWord) {
                        //                 throw error("Unexpected non-whitespace character after JSON", errorIndex)
                        //             }
                        //         }
                        //         numHolder += word;
                        //     } else {
                        //         const numHolderLen = numHolder.length
                        //         const wordLen = word.length + numHolderLen
                        //         const wordToFindLen = wordToFind.length + numHolderLen
                        //         if (wordLen > wordToFindLen) {
                        //             const errorIndex = at - (wordLen - wordToFindLen);
                        //             throw error("Unexpected non-whitespace character after JSON", errorIndex)
                        //         } else {
                        //             const errorInWordIndex = at - 1;
                        //             throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                        //         }
                        //     }
                        // } else {
                        let afterDecimal = ch === '.'
                        let afterExponential
                        if (afterDecimal) {
                            addUpNumberStr();
                        }
                        while (isFinite(ch) && ch !== '') {
                            addUpNumberStr();
                            if (!afterDecimal && ch === '.') {
                                afterDecimal = true
                                addUpNumberStr();
                            } else if (!afterExponential && (ch === 'e' || ch === 'E')) {
                                afterExponential = true
                                addUpNumberStr();
                                if (ch === '+' || ch === '-') {
                                    addUpNumberStr();
                                }
                            }
                        }
                        // }
                        const num = Number(numHolder);
                        if (isNaN(num)) {
                            const errorIndex = at - numHolder.length
                            throw error('Invalid Number', errorIndex);
                        } else {
                            if (isPrimitive) {
                                const indexAfterNumber = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterNumber
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterNumber) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return num;
                        }
                    case 't':
                        word = wordCheck();
                        wordToFind = 'true'
                        if (word === wordToFind) {
                            if (isPrimitive) {
                                const indexAfterWord = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterWord
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterWord) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return true
                        } else {
                            const wordLen = word.length
                            const wordToFindLen = wordToFind.length
                            if (wordLen > wordToFindLen) {
                                const errorIndex = at - (wordLen - wordToFindLen);
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            } else {
                                const errorInWordIndex = at - 1;
                                throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                            }
                        }
                    case 'f':
                        word = wordCheck();
                        wordToFind = 'false'
                        if (word === wordToFind) {
                            if (isPrimitive) {
                                const indexAfterWord = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterWord
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterWord) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return false
                        } else {
                            const wordLen = word.length
                            const wordToFindLen = wordToFind.length
                            if (wordLen > wordToFindLen) {
                                const errorIndex = at - (wordLen - wordToFindLen);
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            } else {
                                const errorInWordIndex = at - 1;
                                throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                            }
                        }
                    case 'n':
                        word = wordCheck();
                        wordToFind = 'null'
                        if (word === wordToFind) {
                            if (isPrimitive) {
                                const indexAfterWord = at
                                let nonWhiteSpace = /[^ ]*/g
                                nonWhiteSpace.lastIndex = indexAfterWord
                                const match = nonWhiteSpace.exec(text)
                                const matchStr = match?.[0]
                                const errorIndex = match?.index;
                                if (matchStr && errorIndex >= indexAfterWord) {
                                    throw error("Unexpected non-whitespace character after JSON", errorIndex)
                                }
                            }
                            return null
                        } else {
                            const wordLen = word.length
                            const wordToFindLen = wordToFind.length
                            if (wordLen > wordToFindLen) {
                                const errorIndex = at - (wordLen - wordToFindLen);
                                throw error("Unexpected non-whitespace character after JSON", errorIndex)
                            } else {
                                const errorInWordIndex = at - 1;
                                throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                            }
                        }
                    // case 'u':
                    //     word = wordCheck();
                    //     wordToFind = 'undefined'
                    //     if (word === wordToFind) {
                    //         if (isPrimitive) {
                    //             const indexAfterWord = at
                    //             let nonWhiteSpace = /[^ ]*/g
                    //             nonWhiteSpace.lastIndex = indexAfterWord
                    //             const match = nonWhiteSpace.exec(text)
                    //             const matchStr = match?.[0]
                    //             const errorIndex = match?.index;
                    //             if (matchStr && errorIndex >= indexAfterWord) {
                    //                 throw error("Unexpected non-whitespace character after JSON", errorIndex)
                    //             }
                    //         }
                    //         return undefined
                    //     } else {
                    //         const wordLen = word.length
                    //         const wordToFindLen = wordToFind.length
                    //         if (wordLen > wordToFindLen) {
                    //             const errorIndex = at - (wordLen - wordToFindLen);
                    //             throw error("Unexpected non-whitespace character after JSON", errorIndex)
                    //         } else {
                    //             const errorInWordIndex = at - 1;
                    //             throw error("Unexpected non-whitespace character after JSON", errorInWordIndex)
                    //         }
                    //     }
                    default:
                        throw error('Unexpected Token');
                }
            }
            // Initialize First Variable
            if (isDone) {
                seek();
                resolve(parse());
            } else {
                await seekAsync();
                resolve(await parseAsync());
            }
        }),
    };
};
function isValidJson(j) {
    let construct = j?.constructor.name
    try { return ((construct === 'Object' && `${j}` === '[object Object]') || j instanceof Array || construct === 'Array') }
    catch (e) { return false }
}
function isJsonObject(obj) {
    return Object.prototype.toString.call(obj) === "[object Object]"
}
function jsonIsEmpty(obj) {
    for (const key in obj) {
        return false;
    }
    return true;
}