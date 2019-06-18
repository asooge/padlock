import { localize as $l } from "@padloc/core/lib/locale.js";
import { Org } from "@padloc/core/lib/org.js";
import { PlanType, SubscriptionStatus, UpdateBillingParams, Subscription } from "@padloc/core/lib/billing.js";
import { shared } from "../styles";
import { dialog, alert, choose } from "../dialog";
import { fileSize } from "../util.js";
import { app } from "../init.js";
import { StateMixin } from "../mixins/state.js";
import { BaseElement, element, property, html, css, query } from "./base.js";
import "./icon.js";
import { LoadingButton } from "./loading-button.js";
import { UpdateSubscriptionDialog } from "./update-subscription-dialog.js";
import { PremiumDialog } from "./premium-dialog.js";

@element("pl-subscription")
export class OrgSubscription extends StateMixin(BaseElement) {
    @property()
    org: Org | null = null;

    @dialog("pl-update-subscription-dialog")
    private _updateSubscriptionDialog: UpdateSubscriptionDialog;

    @dialog("pl-premium-dialog")
    private _premiumDialog: PremiumDialog;

    @query("#editButton")
    private _editButton: LoadingButton;

    private get _billing() {
        return this.org ? this.org.billing : app.account && app.account.billing;
    }

    private get _subscription() {
        return this._billing && this._billing.subscription;
    }

    private async _update() {
        const sub = this._subscription;
        if (!sub) {
            this._updatePlan();
            return;
        }

        if (!this.org && sub.plan.type === PlanType.Free) {
            return this._premiumDialog.show();
        }

        const canceled = sub.willCancel || sub.status === SubscriptionStatus.Canceled;
        const choices = canceled ? [$l("Resume Subscription")] : [$l("Cancel Subscription")];

        if (this.org) {
            choices.push($l("Update Plan"));
        }

        const choice = await choose("", choices);

        switch (choice) {
            case 0:
                return canceled ? this._resumeSubscription() : this._cancelSubscription();
            case 1:
                return this._updateSubscriptionDialog.show(this.org!);
        }
    }

    private _updatePlan() {
        this.org ? this._updateSubscriptionDialog.show(this.org) : this._premiumDialog.show();
    }

    private async _do(fn: () => Promise<any>) {
        if (this._editButton.state === "loading") {
            return;
        }

        this._editButton.start();
        try {
            await fn();
            this._editButton.success();
        } catch (e) {
            this._editButton.fail();
            alert(e.message || $l("Something went wrong. Please try again later!"), { type: "warning" });
        }
    }

    private async _cancelSubscription() {
        this._do(() => app.updateBilling(new UpdateBillingParams({ cancel: true })));
    }

    private async _resumeSubscription() {
        this._do(() => app.updateBilling(new UpdateBillingParams({ cancel: false })));
    }

    static styles = [
        shared,
        css`
            :host {
                display: block;
                position: relative;
                display: flex;
                flex-direction: column;
            }

            .quota {
                margin: 0 12px 12px 12px;
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            }

            .quota-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 4px;
                font-weight: bold;
                text-align: center;
            }

            .quota-item[warning] {
                color: var(--color-negative);
            }

            .quota-item pl-icon {
                font-size: 150%;
            }

            .quota-item .label {
                font-size: var(--font-size-small);
            }

            .edit-button {
                position: absolute;
                top: 12px;
                right: 12px;
                z-index: 1;
            }

            .missing {
                opacity: 0.7;
                cursor: pointer;
            }

            .plan-name {
                font-size: 150%;
                font-weight: bold;
                margin: 16px 8px;
                text-align: center;
            }

            button {
                font-weight: bold;
            }

            .premium-button {
                margin: 0 12px 12px 12px;
            }
        `
    ];

    render() {
        if (!app.account) {
            return html``;
        }

        const account = app.account!;
        const billing = this.org ? this.org.billing : account.billing;
        const sub = (billing && billing.subscription) || new Subscription();

        const trialDays = sub.trialEnd
            ? Math.max(0, Math.ceil((sub.trialEnd.getTime() - Date.now()) / 1000 / 60 / 60 / 24))
            : 0;

        const periodDays = sub.periodEnd
            ? Math.max(0, Math.ceil((sub.periodEnd.getTime() - Date.now()) / 1000 / 60 / 60 / 24))
            : 0;

        return html`
            <div class="plan-name">
                ${sub.plan.name}
            </div>

            <div class="quota">
                ${this.org
                    ? html`
                          <div class="quota-item" ?warning=${this.org.members.length >= this.org.quota.members}>
                              <pl-icon icon="members"></pl-icon>

                              <div class="label">
                                  ${this.org.members.length} / ${this.org.quota.members}
                              </div>
                          </div>

                          <div class="quota-item" ?warning=${this.org.groups.length >= this.org.quota.groups}>
                              <pl-icon icon="group"></pl-icon>

                              <div class="label">
                                  ${this.org.groups.length} / ${this.org.quota.groups}
                              </div>
                          </div>

                          <div class="quota-item" ?warning=${this.org.vaults.length >= this.org.quota.vaults}>
                              <pl-icon icon="vaults"></pl-icon>

                              <div class="label">
                                  ${this.org.vaults.length} / ${this.org.quota.vaults}
                              </div>
                          </div>

                          <div
                              class="quota-item"
                              ?warning=${this.org.usedStorage >= this.org.quota.storage * 1e9 - 5e6}
                          >
                              <pl-icon icon="storage"></pl-icon>

                              <div class="label">
                                  ${fileSize(this.org.usedStorage)} / ${this.org.quota.storage} GB
                              </div>
                          </div>
                      `
                    : html`
                          <div
                              class="quota-item"
                              ?warning=${account.quota.items !== -1 && app.mainVault!.items.size >= account.quota.items}
                          >
                              <pl-icon icon="list"></pl-icon>

                              <div class="label">
                                  ${account.quota.items === -1
                                      ? $l("Unlimited")
                                      : `${app.mainVault!.items.size} / ${account.quota.items}`}
                              </div>
                          </div>

                          <div class="quota-item" ?warning=${account.usedStorage >= account.quota.storage * 1e9 - 5e6}>
                              <pl-icon icon="storage"></pl-icon>

                              <div class="label">
                                  ${fileSize(account.usedStorage)} / ${account.quota.storage} GB
                              </div>
                          </div>
                      `}

                <div class="quota-item">
                    <pl-icon icon="dollar"></pl-icon>

                    <div class="label">
                        ${$l("{0} / Year", ((sub.members * sub.plan.cost) / 100).toFixed(2))}
                    </div>
                </div>

                ${sub.willCancel
                    ? html`
                          <div class="quota-item" warning>
                              <pl-icon icon="time"></pl-icon>

                              <div class="label">
                                  ${$l("Canceled ({0} days left)", periodDays.toString())}
                              </div>
                          </div>
                      `
                    : sub.status === SubscriptionStatus.Canceled
                    ? html`
                          <div class="quota-item" warning>
                              <pl-icon icon="error"></pl-icon>

                              <div class="label">
                                  ${$l("Canceled")}
                              </div>
                          </div>
                      `
                    : sub.status === SubscriptionStatus.PastDue || sub.status === SubscriptionStatus.Unpaid
                    ? html`
                          <div class="quota-item" warning>
                              <pl-icon icon="error"></pl-icon>

                              <div class="label">
                                  ${$l("Payment Failed")}
                              </div>
                          </div>
                      `
                    : sub.status === SubscriptionStatus.Trialing
                    ? html`
                          <div class="quota-item" ?warning=${trialDays < 3}>
                              <pl-icon icon="time"></pl-icon>

                              <div class="label">
                                  ${$l("Trialing ({0} days left)", trialDays.toString())}
                              </div>
                          </div>
                      `
                    : html``}
            </div>

            ${this.org || sub.plan.type !== PlanType.Free
                ? html`
                      <pl-loading-button id="editButton" class="edit-button tap icon" @click=${this._update}>
                          <pl-icon icon="edit"></pl-icon>
                      </pl-loading-button>
                  `
                : html`
                      <button class="premium-button primary tap" @click=${this._update}>${$l("Go Premium")}</button>
                  `}
        `;
    }
}