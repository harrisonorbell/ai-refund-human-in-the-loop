
const API_URL = "/api/refund-requests";
const HISTORY_API_URL = "/api/refund-history";

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");

const requestsContainer = document.getElementById("requestsContainer");
const dashboardMessage = document.getElementById("dashboardMessage");
const refreshButton = document.getElementById("refreshButton");

const pendingCount = document.getElementById("pendingCount");
const approvedCount = document.getElementById("approvedCount");
const rejectedCount = document.getElementById("rejectedCount");

let managerAuthorization = null;

// -----------------------------------------
// MANAGER LOGIN
// -----------------------------------------

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("managerUsername").value;
    const password = document.getElementById("managerPassword").value;

    const authorization = "Basic " + btoa(`${username}:${password}`);

    loginMessage.textContent = "Signing in...";

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Authorization": authorization
            }
        });

        if (!response.ok) {
            throw new Error("Invalid username or password.");
        }

        managerAuthorization = authorization;

        document.getElementById("managerPassword").value = "";

        loginSection.hidden = true;
        dashboardSection.hidden = false;
        loginMessage.textContent = "";

        await loadRefundRequests();

    } catch (error) {
        loginMessage.textContent = error.message;
    }
});

// -----------------------------------------
// MANAGER LOGOUT
// -----------------------------------------

logoutButton.addEventListener("click", () => {
    managerAuthorization = null;

    loginForm.reset();
    requestsContainer.innerHTML = "";

    pendingCount.textContent = "—";
    approvedCount.textContent = "—";
    rejectedCount.textContent = "—";

    dashboardMessage.textContent = "";
    dashboardMessage.className = "";

    dashboardSection.hidden = true;
    loginSection.hidden = false;
});

// -----------------------------------------
// SUBMIT MANAGER DECISION
// -----------------------------------------

async function submitManagerDecision(requestId, decision, managerNotes) {
    if (!managerAuthorization) {
        throw new Error("Please sign in first.");
    }

    const response = await fetch("/api/refund-decision", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": managerAuthorization
        },
        body: JSON.stringify({
            request_id: requestId,
            decision: decision,
            manager_notes: managerNotes
        })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.message || "Unable to save manager decision."
        );
    }

    return result;
}

// -----------------------------------------
// HTML ESCAPING
// -----------------------------------------

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// -----------------------------------------
// LOAD REFUNDS AND DASHBOARD STATISTICS
// -----------------------------------------

async function loadRefundRequests() {
    if (!managerAuthorization) return;

    refreshButton.disabled = true;

    dashboardMessage.className = "";
    dashboardMessage.textContent = "Loading refund requests...";

    try {
        // Fetch pending refund requests.
        const response = await fetch(API_URL, {
            headers: {
                "Authorization": managerAuthorization
            }
        });

        if (!response.ok) {
            throw new Error(`Pending API error: ${response.status}`);
        }

        const requests = await response.json();

        if (!Array.isArray(requests)) {
            throw new Error("Unexpected pending refund format.");
        }

        // Fetch complete refund history.
        const historyResponse = await fetch(HISTORY_API_URL, {
            headers: {
                "Authorization": managerAuthorization
            }
        });

        if (!historyResponse.ok) {
            throw new Error(
                `History API error: ${historyResponse.status}`
            );
        }

        const history = await historyResponse.json();

        if (!Array.isArray(history)) {
            throw new Error("Unexpected refund history format.");
        }

        refundHistory = history;
        renderRefundHistory();

        // Update dashboard statistics.
        pendingCount.textContent = requests.length;

        approvedCount.textContent = history.filter(refund =>
            refund.status === "approved" ||
            refund.status === "auto_approved"
        ).length;

        rejectedCount.textContent = history.filter(refund =>
            refund.status === "rejected"
        ).length;

        // Clear existing refund cards.
        requestsContainer.innerHTML = "";

        if (requests.length === 0) {
            requestsContainer.innerHTML =
                '<p class="empty-state">No pending refund requests.</p>';
        }

        // Render pending refund cards.
        requests.forEach(request => {
            const card = document.createElement("div");
            card.className = "request-card";

            card.innerHTML = `
                <div class="request-header">
                    <h3>${escapeHTML(request.customer_name)}</h3>
                    <span class="status pending_review">
                        Pending Review
                    </span>
                </div>

                <div class="request-details">
                    <p>
                        <strong>Order ID:</strong>
                        ${escapeHTML(request.order_id)}
                    </p>

                    <p>
                        <strong>Refund Amount:</strong>
                        $${escapeHTML(request.refund_amount)}
                    </p>

                    <p>
                        <strong>Email:</strong>
                        ${escapeHTML(request.customer_email)}
                    </p>

                    <p>
                        <strong>Purchase Date:</strong>
                        ${escapeHTML(request.purchase_date)}
                    </p>

                    <p>
                        <strong>Refund Reason:</strong>
                        ${escapeHTML(request.refund_reason)}
                    </p>

                    <p>
                        <strong>AI Recommendation:</strong>
                        ${escapeHTML(request.ai_recommendation)}
                    </p>
                </div>

                <p>
                    <strong>AI Summary:</strong>
                    ${escapeHTML(request.ai_summary)}
                </p>

                <textarea
                    class="manager-notes"
                    placeholder="Enter reason for your decision..."
                ></textarea>

                <div class="manager-actions">
                    <button
                        class="approve-button"
                        type="button"
                    >
                        Approve
                    </button>

                    <button
                        class="reject-button"
                        type="button"
                    >
                        Reject
                    </button>
                </div>
            `;

            const approveButton =
                card.querySelector(".approve-button");

            const rejectButton =
                card.querySelector(".reject-button");

            const notesField =
                card.querySelector(".manager-notes");

            // -----------------------------------------
            // HANDLE APPROVAL OR REJECTION
            // -----------------------------------------

            async function handleDecision(decision) {
                const notes = notesField.value.trim();

                if (notes.length < 5) {
                    dashboardMessage.className = "error";
                    dashboardMessage.textContent =
                        "Please enter at least 5 characters in the manager notes.";
                    return;
                }

                const action =
                    decision === "approved" ? "approve" : "reject";

                const confirmed = window.confirm(
                    `Are you sure you want to ${action} this $${request.refund_amount} refund?`
                );

                if (!confirmed) return;

                approveButton.disabled = true;
                rejectButton.disabled = true;

                dashboardMessage.className = "";
                dashboardMessage.textContent =
                    "Saving manager decision...";

                try {
                    await submitManagerDecision(
                        request.id,
                        decision,
                        notes
                    );

                    // Reload pending refunds and all statistics.
                    await loadRefundRequests();

                    dashboardMessage.className = "success";
                    dashboardMessage.textContent =
                        `Refund ${decision} successfully.`;

                } catch (error) {
                    if (error.message.includes("already processed")) {
                        await loadRefundRequests();
                        dashboardMessage.className = "error";
                        dashboardMessage.textContent =
                            "This refund has already been processed by another manager. The dashboard has been refreshed.";
                    } else {
                        dashboardMessage.className = "error";
                        dashboardMessage.textContent = error.message;

                        approveButton.disabled = false;
                        rejectButton.disabled = false;
                    }
                }
            }

            approveButton.addEventListener("click", () => {
                handleDecision("approved");
            });

            rejectButton.addEventListener("click", () => {
                handleDecision("rejected");
            });

            requestsContainer.appendChild(card);
        });

        dashboardMessage.textContent = "";

    } catch (error) {
        console.error("Dashboard error:", error);

        dashboardMessage.className = "error";
        dashboardMessage.textContent =
            "Unable to load refund requests. Check your API connections.";

    } finally {
        refreshButton.disabled = false;
    }
}

// -----------------------------------------
// REFRESH DASHBOARD
// -----------------------------------------

refreshButton.addEventListener("click", () => {
    if (managerAuthorization) {
        loadRefundRequests();
    }
});


// -----------------------------------------
// REFUND HISTORY
// -----------------------------------------

const historyContainer = document.getElementById("historyContainer");

const historyButtons = {
    all: document.getElementById("allHistoryButton"),
    approved: document.getElementById("approvedHistoryButton"),
    rejected: document.getElementById("rejectedHistoryButton")
};

let refundHistory = [];
let activeHistoryFilter = "all";

// Format dates for display.
function formatRefundDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Australia/Brisbane"
    });
}

// Display refund history cards.
function renderRefundHistory() {
    let completed = refundHistory
        .filter(refund =>
            ["approved", "auto_approved", "rejected"].includes(refund.status)
        )
        .sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

    if (activeHistoryFilter === "approved") {
        completed = completed.filter(refund =>
            ["approved", "auto_approved"].includes(refund.status)
        );
    }

    if (activeHistoryFilter === "rejected") {
        completed = completed.filter(refund =>
            refund.status === "rejected"
        );
    }

    historyContainer.innerHTML = "";

    if (completed.length === 0) {
        historyContainer.innerHTML =
            '<p class="empty-state">No matching refund history.</p>';
        return;
    }

    completed.forEach(refund => {
        const card = document.createElement("div");
        card.className = "history-card";

        const statusLabels = {
            approved: "Manager Approved",
            auto_approved: "Automatically Approved",
            rejected: "Rejected"
        };

        card.innerHTML = `
            <div class="request-header">
                <h3>${escapeHTML(refund.customer_name)}</h3>
                <span class="status ${escapeHTML(refund.status)}">
                    ${statusLabels[refund.status]}
                </span>
            </div>

            <div class="request-details">
                <p><strong>Order ID:</strong> ${escapeHTML(refund.order_id)}</p>
                <p><strong>Amount:</strong> $${escapeHTML(refund.refund_amount)}</p>
                <p><strong>Email:</strong> ${escapeHTML(refund.customer_email)}</p>
                <p><strong>Purchase Date:</strong> ${escapeHTML(formatRefundDate(refund.purchase_date))}</p>
                <p><strong>Refund Reason:</strong> ${escapeHTML(refund.refund_reason)}</p>
                <p><strong>AI Recommendation:</strong> ${escapeHTML(refund.ai_recommendation)}</p>
            </div>

            <p><strong>AI Summary:</strong> ${escapeHTML(refund.ai_summary)}</p>

            ${refund.manager_notes ? `
                <p><strong>Manager Notes:</strong> ${escapeHTML(refund.manager_notes)}</p>
            ` : ""}
        `;

        historyContainer.appendChild(card);
    });
}

// Handle history filters.
Object.entries(historyButtons).forEach(([filter, button]) => {
    button.addEventListener("click", () => {
        activeHistoryFilter = filter;

        Object.entries(historyButtons).forEach(([name, otherButton]) => {
            otherButton.classList.toggle("active", name === filter);
        });

        renderRefundHistory();
    });
});
