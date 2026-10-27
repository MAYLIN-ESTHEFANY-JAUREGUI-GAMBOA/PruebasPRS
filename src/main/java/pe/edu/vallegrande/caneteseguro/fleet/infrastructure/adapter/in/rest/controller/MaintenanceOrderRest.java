package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.in.rest.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.AssignWorkshopRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.CancelOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.CreateMaintenanceOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.TechnicalDischargeRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.request.UpdateMaintenanceOrderRequest;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.response.MaintenanceOrderDetailResponse;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.response.MaintenanceOrderResponse;
import pe.edu.vallegrande.caneteseguro.fleet.domain.exception.DomainException;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.in.MaintenanceOrderUseCase;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderStatus;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.mapper.MaintenanceOrderMapper;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.security.RoleConstants;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.security.SecurityUtils;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.security.TenantScope;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Primary Inbound REST Controller for Fleet Maintenance Orders.
 * 100% compliant with Hexagonal, Reactive WebFlux and AGENTS.md standards:
 * - Direct Mono/Flux publisher return types without unnecessary wrapper classes.
 * - Centralized exception handling via GlobalExceptionHandler (no hardcoded error responses).
 * - Pure English REST API standard.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/maintenance-orders")
@RequiredArgsConstructor
@Tag(name = "Maintenance Orders", description = "Lifecycle and repair management for emergency fleet vehicles")
public class MaintenanceOrderRest {

    private final MaintenanceOrderUseCase useCase;

    @GetMapping
    @PreAuthorize(RoleConstants.READ_ROLES)
    @Operation(summary = "List all maintenance orders scoped to entity tenant")
    public Flux<MaintenanceOrderResponse> getAll() {
        return byScope()
                .map(MaintenanceOrderMapper::toResponse);
    }

    @GetMapping("/{id}")
    @PreAuthorize(RoleConstants.READ_ROLES)
    @Operation(summary = "Get maintenance order by unique ID")
    public Mono<MaintenanceOrderDetailResponse> getById(
            @Parameter(description = "Unique ID of the maintenance order")
            @PathVariable String id) {
        return visible(useCase.findById(id))
                .switchIfEmpty(Mono.error(new DomainException("Maintenance order not found with ID: " + id)))
                .map(MaintenanceOrderMapper::toDetailResponse);
    }

    @GetMapping("/code/{code}")
    @PreAuthorize(RoleConstants.READ_ROLES)
    @Operation(summary = "Get maintenance order by tracking code")
    public Mono<MaintenanceOrderDetailResponse> getByCode(
            @Parameter(description = "Order tracking code (e.g., ORD-2026-XXXX)")
            @PathVariable String code) {
        return visible(useCase.findByCode(code))
                .switchIfEmpty(Mono.error(new DomainException("Maintenance order not found with code: " + code)))
                .map(MaintenanceOrderMapper::toDetailResponse);
    }

    @GetMapping("/resource/{resourceId}")
    @PreAuthorize(RoleConstants.READ_ROLES)
    @Operation(summary = "List maintenance history of an operational resource")
    public Flux<MaintenanceOrderResponse> getByResource(
            @Parameter(description = "Operational resource ID")
            @PathVariable String resourceId) {
        return visibles(useCase.findByResource(resourceId))
                .map(MaintenanceOrderMapper::toResponse);
    }

    @GetMapping("/entity/{entityId}")
    @PreAuthorize(RoleConstants.READ_ROLES)
    @Operation(summary = "List maintenance orders by owning entity")
    public Flux<MaintenanceOrderResponse> getByEntity(
            @Parameter(description = "Entity ID (police station, fire brigade, hospital)")
            @PathVariable String entityId) {
        return TenantScope.current().flatMapMany(scope -> {
            if (scope.all() || (scope.entidadId() != null && scope.entidadId().equals(entityId))) {
                return useCase.findByEntity(entityId);
            }
            return Flux.empty();
        }).map(MaintenanceOrderMapper::toResponse);
    }

    @GetMapping("/status/{status}")
    @PreAuthorize(RoleConstants.READ_ROLES)
    @Operation(summary = "List orders filtered by lifecycle status")
    public Flux<MaintenanceOrderResponse> getByStatus(
            @Parameter(description = "Order lifecycle status")
            @PathVariable OrderStatus status) {
        return visibles(useCase.findByStatus(status))
                .map(MaintenanceOrderMapper::toResponse);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(RoleConstants.WRITE_ROLES)
    @Operation(summary = "Create maintenance order and disable resource in vg-ms-recursos")
    public Mono<MaintenanceOrderDetailResponse> create(
            @Valid @RequestBody CreateMaintenanceOrderRequest request,
            ServerWebExchange exchange) {
        String token = extractToken(exchange);

        return TenantScope.current().flatMap(scope -> {
            scope.requireWriter();
            if (!scope.all() && scope.entidadId() != null) {
                request.setEntityId(scope.entidadId());
            }
            return SecurityUtils.getCurrentUsername()
                    .flatMap(dni -> useCase.create(request, token, dni))
                    .map(MaintenanceOrderMapper::toDetailResponse);
        });
    }

    @PutMapping("/{id}")
    @PreAuthorize(RoleConstants.WRITE_ROLES)
    @Operation(summary = "Update editable header fields of an active maintenance order")
    public Mono<MaintenanceOrderDetailResponse> update(
            @PathVariable String id,
            @Valid @RequestBody UpdateMaintenanceOrderRequest request) {
        return own(id)
                .flatMap(scope -> useCase.update(id, request))
                .map(MaintenanceOrderMapper::toDetailResponse);
    }

    @PatchMapping("/{id}/workshop")
    @PreAuthorize(RoleConstants.WRITE_ROLES)
    @Operation(summary = "Assign external mechanical workshop, initial diagnosis and estimated cost")
    public Mono<MaintenanceOrderDetailResponse> assignWorkshop(
            @PathVariable String id,
            @Valid @RequestBody AssignWorkshopRequest request) {
        return own(id)
                .flatMap(scope -> useCase.assignWorkshop(id, request))
                .map(MaintenanceOrderMapper::toDetailResponse);
    }

    @PatchMapping("/{id}/start-repair")
    @PreAuthorize(RoleConstants.WRITE_ROLES)
    @Operation(summary = "Mark beginning of repair works in workshop (IN_WORKSHOP)")
    public Mono<MaintenanceOrderDetailResponse> startRepair(@PathVariable String id) {
        return own(id)
                .flatMap(scope -> useCase.startRepair(id))
                .map(MaintenanceOrderMapper::toDetailResponse);
    }

    @PatchMapping("/{id}/quality-control")
    @PreAuthorize(RoleConstants.WRITE_ROLES)
    @Operation(summary = "Pass vehicle to quality control and technical test stage (QUALITY_CONTROL)")
    public Mono<MaintenanceOrderDetailResponse> passToQualityControl(@PathVariable String id) {
        return own(id)
                .flatMap(scope -> useCase.passToQualityControl(id))
                .map(MaintenanceOrderMapper::toDetailResponse);
    }

    @PostMapping("/{id}/technical-discharge")
    @PreAuthorize(RoleConstants.WRITE_ROLES)
    @Operation(summary = "Issue technical discharge, complete order and restore resource to DISPONIBLE")
    public Mono<MaintenanceOrderDetailResponse> issueTechnicalDischarge(
            @PathVariable String id,
            @Valid @RequestBody TechnicalDischargeRequest request,
            ServerWebExchange exchange) {
        String token = extractToken(exchange);

        return own(id).flatMap(scope -> SecurityUtils.getCurrentUsername()
                .flatMap(dni -> useCase.issueTechnicalDischarge(id, request, token, dni))
                .map(MaintenanceOrderMapper::toDetailResponse));
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize(RoleConstants.WRITE_ROLES)
    @Operation(summary = "Cancel maintenance order and restore resource to DISPONIBLE")
    public Mono<MaintenanceOrderDetailResponse> cancel(
            @PathVariable String id,
            @Valid @RequestBody CancelOrderRequest request,
            ServerWebExchange exchange) {
        String token = extractToken(exchange);

        return own(id).flatMap(scope -> useCase.cancel(id, request, token)
                .map(MaintenanceOrderMapper::toDetailResponse));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MULTI-TENANT ISOLATION HELPERS (ENTITY / SUPER_ADMIN)
    // ═══════════════════════════════════════════════════════════════════════════

    private Flux<MaintenanceOrder> byScope() {
        return TenantScope.current().flatMapMany(scope -> {
            if (scope.all()) {
                return useCase.findAll();
            }
            if (scope.entidadId() != null) {
                return useCase.findByEntity(scope.entidadId());
            }
            return Flux.empty();
        });
    }

    private Mono<MaintenanceOrder> visible(Mono<MaintenanceOrder> orderMono) {
        return TenantScope.current().flatMap(scope ->
                orderMono.filter(order -> scope.canRead(order.getEntityId())));
    }

    private Flux<MaintenanceOrder> visibles(Flux<MaintenanceOrder> ordersFlux) {
        return TenantScope.current().flatMapMany(scope ->
                ordersFlux.filter(order -> scope.canRead(order.getEntityId())));
    }

    private Mono<TenantScope> own(String id) {
        return TenantScope.current().flatMap(scope -> {
            scope.requireWriter();
            if (scope.all()) {
                return Mono.just(scope);
            }
            return useCase.findById(id)
                    .filter(order -> scope.canRead(order.getEntityId()))
                    .switchIfEmpty(Mono.error(TenantScope.forbidden()))
                    .thenReturn(scope);
        });
    }

    private String extractToken(ServerWebExchange exchange) {
        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return "";
    }
}
