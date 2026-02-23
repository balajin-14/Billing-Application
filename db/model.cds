namespace billingApp.db;

entity Dealers {
    key dealerID          : String;
        dealerName        : String;
        fundAvailability  : Decimal;
        limitAvailability : Decimal;
        infOtherAmount    : Decimal;
        infType           : String;

        allocations       : Association to many DealerAllocations
                                on allocations.dealer = $self;
}

entity Models {
    key modelCode          : String;
        modelDesc          : String;
        depotStock         : Integer;
        allocatedQty       : Integer;
        availableStock     : Integer;
        orderQty           : Integer;
        fundRequired       : Decimal;
        allocationQty      : Integer default 0;
        perBikeValue       : Decimal;
        orderValue         : Decimal;
        fst                : Integer;
        black              : Integer;
        red                : Integer;
        yellow             : Integer;
        green              : Integer;
        rationalAllocation : Integer;
        snopAllocation     : Integer;
        svpoAllocation     : Integer;
        totalAllocation    : Integer;

        allocations        : Association to many DealerAllocations
                                on allocations.model = $self;
}


entity DealerAllocations {
    key ID          : UUID;

        dealer      : Association to Dealers;
        model       : Association to Models;

        allocationQty : Integer;
        orderValue    : Decimal;
}
